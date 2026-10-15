/**
 * The HTML element every template adapter writes the same way (#3475): its
 * attributes, its hydration markers, its children, and the void-element
 * form. The adapter supplies how each value is spelled in its template
 * language; the order and the conditions live here once.
 */

import { BF_PORTAL_OWNER, BF_REGION } from '@barefootjs/shared'
import type { IRElement, IRFragment, IRNode } from '../types.ts'
import { emitAttrValue, type AttrValueEmitter } from './attr-value-emitter.ts'
import { isDangerousInnerHtmlAttr } from './dangerous-inner-html.ts'

const VOID_ELEMENTS = [
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]

/**
 * The element's own attributes, each lowered through `emitter`, as a
 * leading-space list (`''` when none renders).
 */
export function renderElementAttributes(element: IRElement, emitter: AttrValueEmitter): string {
  const parts: string[] = []

  for (const attr of element.attrs) {
    // `/* @client */` attribute bindings are deferred to hydrate: the
    // client runtime sets/patches the attribute in a mount effect (the
    // CSR template omits it; ir-to-client-js emits the setAttribute
    // effect). Skip SSR emission so the server omits the attribute and
    // the unsupported-expression lowering is never reached for a deferred
    // predicate (no BF101 / BF102). #1966
    if (attr.clientOnly) continue
    // `dangerouslySetInnerHTML` never renders as an HTML attribute — it's
    // handled by `renderDangerousInnerHtml` instead, which replaces the
    // element's children. Skip it here so its `{ __html: ... }` object
    // literal never reaches the generic object-literal BF101 refusal
    // (which would double-report alongside the purpose-built one).
    if (isDangerousInnerHtmlAttr(attr)) continue
    // `key` never renders as a literal HTML attribute — #2753 resolves it
    // onto `element.keyAttr` (name AND value) at IR-build time, emitted
    // separately by `renderElementShell`. A stray `key` that jsx-to-ir.ts did
    // NOT recognize as a loop row root (so `keyAttr` was never set) has no
    // defined rendering outside a `.map()` anyway; drop it rather than
    // leak an invalid `key="..."` HTML attribute.
    if (attr.name === 'key') continue
    // Rewrite JSX special-prop names to their HTML-attribute counterparts (#1475).
    const attrName = attr.name === 'className' ? 'class' : attr.name
    const lowered = emitAttrValue(attr.value, emitter, attrName)
    if (lowered) parts.push(lowered)
  }

  return parts.length > 0 ? ' ' + parts.join(' ') : ''
}

/** How one adapter spells the parts of an element {@link renderElementShell} writes. */
export interface ElementShellSpelling {
  /** Lowers each attribute value, the row key included. */
  attrEmitter: AttrValueEmitter
  /** The element's `dangerouslySetInnerHTML` content, or `null` when it has none. */
  renderDangerousInnerHtml(element: IRElement): string | null
  renderChildren(children: IRNode[]): string
  renderScopeMarker(instanceIdExpr: string): string
  renderSlotMarker(slotId: string): string
  /**
   * The raw print of the runtime's `data-key` attribute, for a render root
   * that carries whatever key its own caller supplies (the `bf` instance's
   * `data_key` field).
   */
  dataKeyRelay: string
  /** The escaped print of this instance's scope id, the `bf-po` value. */
  scopeIdValue: string
  /** Sends an SSR-portal element to the `bf.portals()` outlet instead of placing it inline. */
  wrapSsrPortalElement(rendered: string): string
}

/** The element, from its open tag to its close tag. */
export function renderElementShell(element: IRElement, spelling: ElementShellSpelling): string {
  const tag = element.tag
  const attrs = renderElementAttributes(element, spelling.attrEmitter)
  const dangerousHtml = spelling.renderDangerousInnerHtml(element)
  const children = dangerousHtml !== null ? dangerousHtml : spelling.renderChildren(element.children)

  let hydrationAttrs = ''
  if (element.needsScope) {
    hydrationAttrs += ` ${spelling.renderScopeMarker('')}`
  }
  // #2753: `element.keyAttr` is the ONE IR-resolved decision for this
  // element's row-key attribute — replacing both the `carriesDataKey`
  // boolean and the adapters' own `rootScopeNodes`/`needsScope` check
  // (mechanism 2: a render-root relay, including the #2732 fragment-root
  // case) and the separate `currentLoopKeyDepth`-driven rewrite of a
  // literal `key` attribute the adapters used to do in `renderAttributes`
  // (mechanism 1: a `.map()` row root compiled inline here).
  if (element.keyAttr) {
    if (element.keyAttr.value !== undefined) {
      const lowered = emitAttrValue(
        { kind: 'expression', expr: element.keyAttr.value },
        spelling.attrEmitter,
        element.keyAttr.name,
      )
      if (lowered) hydrationAttrs += ` ${lowered}`
    } else {
      // Relay: this element is one of THIS component's own render roots,
      // carrying whatever key its OWN caller supplies at runtime when this
      // component is itself invoked as a caller's keyed loop row. Mirrors
      // Hono stamping data-key on each loop item's root, including
      // early-return (if-statement) roots (#1297), and #2732's fragment-root
      // case.
      hydrationAttrs += ` ${spelling.dataKeyRelay}`
    }
  }
  if (element.slotId) {
    hydrationAttrs += ` ${spelling.renderSlotMarker(element.slotId)}`
  }
  // Page-lifecycle boundary lowered from `<Region>` (spec/router.md). The id
  // is a deterministic static string (`<file scope>:<index>`), so it emits as
  // a plain literal attribute — no template tag.
  if (element.regionId) {
    hydrationAttrs += ` ${BF_REGION}="${element.regionId}"`
  }
  // #3119: the `ref`-callback SSR-portal pattern (`ssrPortalOwnerScope`,
  // `isSsrPortalRefCallback` in `@barefootjs/jsx`) — the overlay/content
  // pattern the dialog-style primitives use. Stamp `bf-po` directly on
  // this element's own tag, matching exactly what the client
  // `createPortal(el, document.body, { ownerScope })` stamps onto the
  // SAME element at hydrate time (`packages/client/src/runtime/
  // portal.ts`), mirroring the Hono reference adapter's identical
  // `BF_PORTAL_OWNER` stamp. The element itself is then routed through
  // `wrapSsrPortalElement` below instead of returned for inline
  // placement, so it renders at the portal outlet the app's own layout
  // places near `</body>`.
  if (element.ssrPortalOwnerScope) {
    hydrationAttrs += ` ${BF_PORTAL_OWNER}="${spelling.scopeIdValue}"`
  }

  const rendered = VOID_ELEMENTS.includes(tag.toLowerCase())
    ? `<${tag}${attrs}${hydrationAttrs}>`
    : `<${tag}${attrs}${hydrationAttrs}>${children}</${tag}>`

  if (element.ssrPortalOwnerScope) {
    return spelling.wrapSsrPortalElement(rendered)
  }
  return rendered
}

/**
 * A fragment's children. A component-root fragment has no element of its
 * own to carry the scope, so `wrapScopeComment` brackets the children with
 * the comment-based scope marker pair; its end marker bounds the scope's
 * sibling range, or queries from the fragment scope leak onto later
 * siblings owned by the parent (#2289).
 */
export function renderFragmentScope(
  fragment: IRFragment,
  renderChildren: (children: IRNode[]) => string,
  wrapScopeComment: (rendered: string) => string,
): string {
  const children = renderChildren(fragment.children)
  return fragment.needsScopeComment ? wrapScopeComment(children) : children
}
