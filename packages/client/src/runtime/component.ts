/**
 * BarefootJS - Component Creation
 *
 * Functions for dynamically creating component instances at runtime.
 * Used by mapArray()/mapArrayAnchored() when rendering components in loops.
 */

import { getTemplate } from './template.ts'
import { getComponentInit } from './registry.ts'
import { getRegisteredDef } from './hydrate.ts'
import { hydratedScopes } from './hydration-state.ts'
import { untrack } from '@barefootjs/client/reactive'
import { setCurrentScope } from './context.ts'
import { BF_SCOPE, BF_KEY, BF_HOST, BF_AT, BF_PARENT_SCOPE_PLACEHOLDER, BF_PLACEHOLDER } from '@barefootjs/shared'
import type { ComponentDef } from './types.ts'

// Parent scope ID context for renderChild() inside insert() branch templates.
// When set, renderChild uses the parent's scope ID as prefix instead of a random ID,
// producing scope IDs consistent with SSR (e.g., "ParentName_abc_s5" instead of
// "Button_random_s5"). This enables $cSingle's getDualScopeIds check to pass.
// Set by insert() before calling branch.template(), cleared after.
let _parentScopeId: string | null = null

export function setParentScopeId(id: string | null): void {
  _parentScopeId = id
}

/**
 * Where `mapArray` wants a fresh loop row connected before its `init` runs.
 *
 * `mounted` is written back by `mountRowRoot` so the caller can undo the
 * connection if the rest of the row's body then throws — see `createItemScope`.
 * Without it a half-built row stays visible, which detached rows never did.
 */
export type RowMountPoint = { container: Node; anchor: Node | null; mounted?: Element | null }

// Ambient mount point for a loop row.
//
// A loop row created by `renderItem` has no placeholder to replace, so it
// cannot use `mountAt` and its `init` runs detached (see the known-limitation
// docstring in `__tests__/runtime/csr-loop-row-init-connected.test.ts`).
// `mapArray` sets this around the `renderItem` call so the OUTERMOST
// `createComponent` inside it connects the row at `container`/`anchor` before
// running `init` — same guarantee `mountAt` gives the child-slot path.
//
// Consumed once (take-and-clear) so nested `createComponent` calls made from
// the row's own init don't re-use the row's mount point.
//
// `setRowMountPoint` returns the previous value so a caller can restore it
// instead of clearing to `null`. That matters because the ambient is a single
// slot: a row whose own `init` drives a nested `mapArray` would otherwise have
// the inner list's teardown blank out an outer mount point that had not been
// consumed yet. Save-and-restore makes the slot behave like a stack without
// paying for one.
let _rowMountPoint: RowMountPoint | null = null

export function setRowMountPoint(p: RowMountPoint | null): RowMountPoint | null {
  const prev = _rowMountPoint
  _rowMountPoint = p
  return prev
}

function takeRowMountPoint(): RowMountPoint | null {
  const p = _rowMountPoint
  _rowMountPoint = null
  return p
}

/**
 * Connect a loop row whose root is a template clone, before the emitted
 * renderItem body's tail runs.
 *
 * The tail is where the row's nested children initialise (`upsertChild` and
 * friends), and `useContext` resolves by walking `parentElement` — so a child
 * that inits inside a detached row finds no ancestors and falls through to the
 * global last-writer-wins context store, reading whichever provider on the page
 * wrote last. `createComponent` row roots already avoid this by consuming the
 * same ambient (step 7b); a clone root has no runtime function in the middle,
 * so the compiler emits this call for it instead.
 *
 * Take-and-clear, like the `createComponent` path: a nested `createComponent`
 * driven by this row's own children must not re-use the row's mount point.
 *
 * No-op when there is no ambient point — the hydration branch never calls this
 * (its row came from SSR markup and is already in the document), and a loop
 * runtime that does not hand one down leaves the row exactly as it was.
 */
export function mountRowRoot(el: Element): Element {
  const p = takeRowMountPoint()
  if (p) {
    p.container.insertBefore(el, p.anchor)
    // Record it so the row can be un-mounted if the body throws after this.
    p.mounted = el
  }
  return el
}

/**
 * Create a component instance with DOM element and initialized state.
 *
 * This function:
 * 1. Gets the template function for the component
 * 2. Generates HTML from props using the template
 * 3. Creates DOM element from HTML
 * 4. Sets scope ID and key attributes
 * 5. Initializes the component (attaches event handlers, sets up effects)
 *
 * @param name - Component name (e.g., 'TodoItem')
 * @param props - Props to pass to the component
 * @param key - Optional key for list reconciliation
 * @param slot - Slot-relationship markers stamped as `bf-h` / `bf-m`
 * @param mountAt - Placeholder this component replaces. When given, the
 *   element is connected to the document *before* `init` runs — see
 *   "Connect before init" below.
 * @returns Created DOM element
 *
 * @example
 * const el = createComponent('TodoItem', {
 *   todo: { id: 1, text: 'Buy milk', done: false },
 *   onDelete: () => handleDelete(1)
 * }, 1)
 */
/**
 * Create a component instance from a string name (SSR mode, uses registry)
 * or from a ComponentDef (CSR mode, no registry needed).
 */
/**
 * Slot-relationship metadata stamped onto a freshly-created component as
 * `bf-h` / `bf-m`. Top-level CSR mounts pass no `slot` — they own their
 * own hydration lifecycle and `initChild` re-binds callbacks freely on
 * each reconcile.
 */
export interface CreateComponentSlotInfo {
  /** Host scope id (this child's `bf-h` value). */
  parent: string
  /** Slot id in the host (this child's `bf-m` value). */
  mount: string
}

export function createComponent(
  nameOrDef: string | ComponentDef,
  props: Record<string, unknown> = {},
  key?: string | number,
  slot?: CreateComponentSlotInfo,
  mountAt?: Element | null,
): HTMLElement {
  const element = materializeComponent(nameOrDef, props, key, slot, mountAt)
  // `mountAt` is an unconditional obligation: callers used to run
  // `ph.replaceWith(comp)` themselves on every outcome, so every path that
  // did NOT consume the placeholder still owes the replacement — a missing or
  // empty template (either mode), and the root-deferred-placeholder shape,
  // which must stay detached so its self-replacement stays recoverable.
  // `parentNode` (not `isConnected`) is the right "still unconsumed" probe: it
  // survives a `mountAt` that was itself detached, which is the normal case
  // during multi-root loop-body setup.
  if (mountAt && mountAt.parentNode && element !== mountAt) {
    mountAt.replaceWith(element)
  }
  return element
}

/**
 * Build the element, connect it at `mountAt` when there is one, and run
 * `init` — in that order, which is the whole point (see step 7b).
 *
 * Named "materialize" rather than anything with "unmounted" in it because it
 * DOES mount: the connect has to happen inside, before `init`, and only the
 * paths that cannot consume the placeholder leave that to `createComponent`.
 */
function materializeComponent(
  nameOrDef: string | ComponentDef,
  props: Record<string, unknown> = {},
  key?: string | number,
  slot?: CreateComponentSlotInfo,
  mountAt?: Element | null,
): HTMLElement {
  // A bare callable shim invoked from user code (e.g. an object-literal
  // value `LOGOS[id]()` whose arrow the compiler hoisted into a component)
  // reaches us with no props (#1663). Normalize to an empty object so the
  // descriptor probes below don't throw on `undefined`.
  if (props == null) props = {}
  // Take the row mount point BEFORE any template eval / init can run, so the
  // outermost call for the row is the only one that can consume it.
  const rowMount = mountAt ? null : takeRowMountPoint()
  // ComponentDef mode: use def directly instead of registry lookup
  if (typeof nameOrDef !== 'string') {
    return createComponentFromDef(nameOrDef, props, key, mountAt, rowMount)
  }

  const name = nameOrDef

  // 1. Get template function
  const templateFn = getTemplate(name)
  if (!templateFn) {
    console.warn(`[BarefootJS] Template not found for component: ${name}`)
    return createPlaceholder(name, key)
  }

  // 2. Check for getter children.
  // Children defined via a getter are evaluated AFTER initFn so that context
  // providers set up by the parent are available when children are created.
  const childrenDescriptor = Object.getOwnPropertyDescriptor(props, 'children')
  const childrenIsGetter = childrenDescriptor != null && typeof childrenDescriptor.get === 'function'

  // 3. Evaluate props for template HTML generation, skipping the children getter.
  // Use untrack() so signal reads don't contaminate the caller's effect tracking.
  const unwrappedProps = untrack(() => {
    const result: Record<string, unknown> = {}
    for (const k of Object.keys(props)) {
      if (k === 'children' && childrenIsGetter) {
        result.children = '' // Deferred — will be inserted after initFn
        continue
      }
      const descriptor = Object.getOwnPropertyDescriptor(props, k)
      if (descriptor && typeof descriptor.get === 'function') {
        result[k] = descriptor.get()
      } else {
        result[k] = props[k]
      }
    }
    // Template functions expect children as an HTML string, not an array.
    if (Array.isArray(result.children) && !hasDomElements(result.children)) {
      result.children = (result.children as unknown[])
        .flat()
        .map(c => c == null ? '' : String(c))
        .join('')
    }
    return result
  })

  // 4. Pre-generate the component's scope ID.
  //
  // `comment: true` components (synthesized inline-JSX-callback wrappers
  // from #1211) render as transparent shells — the parsed `firstChild` is
  // already the inner component's root with its own bf-s. Don't overwrite
  // it (scopeId stays null), or `$c(__scope, 's0')` from the wrapper's
  // init resolves to null.
  const def = getRegisteredDef(name)
  const isCommentWrapper = def?.comment === true
  const scopeId = isCommentWrapper ? null : `${name}_${generateId()}`

  // 5. Generate HTML from props.
  //
  // Thread the component's own scope ID into `_parentScopeId` for the
  // template eval so renderChild() stamps parent-prefixed bf-s / bf-h /
  // bf-m on child components — matching the SSR convention so a later
  // `$c(scope, 'sN')` lookup resolves them. Without this, CSR-created
  // children carry a random prefix and their event handlers never wire
  // up (#1627). `slot.parent` takes precedence so hoisted-children
  // placeholders (#1320) still resolve to the calling site's scope.
  const prevParentScopeId = _parentScopeId
  if (slot?.parent) {
    _parentScopeId = slot.parent
  } else if (scopeId) {
    _parentScopeId = scopeId
  }
  let html: string
  try {
    html = templateFn(unwrappedProps)
  } finally {
    _parentScopeId = prevParentScopeId
  }

  // 6. Create DOM element
  const element = parseHTML(html.trim()).firstChild as HTMLElement

  if (!element) {
    console.warn(`[BarefootJS] Template returned empty HTML for component: ${name}`)
    return createPlaceholder(name, key)
  }

  // 7. Set scope ID and key attributes.
  if (scopeId) {
    element.setAttribute(BF_SCOPE, scopeId)
  }
  if (slot) {
    if (slot.parent) element.setAttribute(BF_HOST, slot.parent)
    element.setAttribute(BF_AT, slot.mount)
  }
  if (key !== undefined) {
    element.setAttribute(BF_KEY, String(key))
  }

  // 7b. Connect before init.
  //
  // `initFn` resolves context by DOM position (`useContext` walks
  // `parentElement` from the current scope) and may measure layout. Both
  // need this element to be in the document, so when the caller told us
  // which placeholder we replace, do the replacement NOW rather than
  // after init. Running init detached made `useContext` fall through to
  // the global, last-writer-wins context store, so a child materialised
  // after a sibling provider had run picked up the wrong provider's
  // value. This aligns the CSR path with the SSR one, where the
  // doc-order walker only ever inits elements already in the document
  // (`hydrate.ts`).
  //
  // A root-level deferred placeholder is excluded: its init replaces
  // `element` itself, which the block below recovers via a throwaway
  // wrapper. Connecting first would make that replacement happen in the
  // live DOM with no handle on the result, so this shape keeps the
  // detached behaviour.
  const rootIsDeferredPlaceholder = element.hasAttribute(BF_PLACEHOLDER)
  if (mountAt && !rootIsDeferredPlaceholder) {
    mountAt.replaceWith(element)
  } else if (rowMount && !rootIsDeferredPlaceholder) {
    // Loop row: no placeholder exists, so connect at the position `mapArray`
    // handed down. The reorder step may move the row afterwards; any position
    // inside the container yields the same ancestor chain, which is all
    // `useContext`'s parentElement walk needs.
    rowMount.container.insertBefore(element, rowMount.anchor)
  }

  // 8. Set currentScope so provideContext/useContext are element-scoped.
  // This allows context providers in initFn to store context on this element.
  const prevScope = setCurrentScope(element)

  // 8b. Root-level deferred child (dropped-prop fix): a comment-wrapper
  // parent whose entire render is a single deferred child renders as a
  // bare `data-bf-ph` placeholder. The parent's init calls
  // `upsertChild(__scope, ...)` which replaces the placeholder via
  // `replaceWith` — but a detached root node can't replace itself in
  // place. Park it in a throwaway wrapper so the replacement lands
  // somewhere we can recover, then return the materialised child.
  let placeholderWrapper: HTMLElement | null = null
  if (rootIsDeferredPlaceholder) {
    placeholderWrapper = parseHTML('<div></div>').firstChild as HTMLElement
    placeholderWrapper.appendChild(element)
  }

  // 9. Initialize the component (context providers set up here).
  const initFn = getComponentInit(name)
  if (initFn) {
    // Pass original props (with getters) for reactivity. For a root
    // deferred placeholder, init's `upsertChild(element, ...)` matches the
    // placeholder element itself and replaces it inside the wrapper.
    initFn(element, props)
  }

  if (rootIsDeferredPlaceholder && placeholderWrapper) {
    const materialised = placeholderWrapper.firstElementChild as HTMLElement | null
    if (materialised && !materialised.hasAttribute(BF_PLACEHOLDER)) {
      // The deferred child was created in place of the placeholder.
      // `materialised` is the child's OWN element, created via
      // upsertChild -> createComponent, which already marked itself
      // hydrated with its own props. We must NOT re-run this function's
      // own registration steps on it here — that would re-run the
      // *parent's* init on an element whose placeholder is already gone
      // and could not re-materialise. So just restore the scope and
      // return the already-registered child.
      // (Parent-scope effects are unaffected: createEffect ownership lives
      // in the EffectContext tree, not the discarded placeholder element.)
      setCurrentScope(prevScope)
      return materialised
    }
    // Placeholder was not replaced (no init / no matching child): fall
    // through with the original placeholder element detached from wrapper.
    placeholderWrapper.removeChild(element)
  }

  // 10. Evaluate getter children and insert them.
  // Children are evaluated NOW (after initFn) so that context provided by
  // the parent is in the global store when children call useContext().
  if (childrenIsGetter) {
    const children = untrack(() => childrenDescriptor!.get!())
    if (children != null) {
      insertGetterChildren(element, children)
    }
  }

  // 11. Restore previous scope
  setCurrentScope(prevScope)

  // 12. Mark element as initialized
  hydratedScopes.add(element)

  return element
}

/**
 * Render a child component's template to an HTML string.
 * Used by compiler-generated template functions when a stateless component
 * appears inside a conditional branch or loop template.
 *
 * If the component has a registered template, it renders the HTML and injects
 * a bf-s scope attribute. Otherwise, falls back to an empty placeholder.
 *
 * @param name - Component name (e.g., 'Spinner')
 * @param props - Props to pass to the template
 * @param key - Optional key for list reconciliation
 * @returns HTML string with scope marker
 */
export function renderChild(
  name: string,
  props: Record<string, unknown>,
  key?: string | number,
  slotSuffix?: string
): string {
  const templateFn = getTemplate(name)
  const suffix = slotSuffix ? `_${slotSuffix}` : ''
  // When inside an insert() branch template with a known parent scope,
  // use the parent scope ID so child scope IDs match the SSR convention
  // (e.g., ~ParentName_parentHash_s5 instead of ~Button_randomHash_s5).
  // This enables $cSingle's getDualScopeIds verification to pass.
  const scopePrefix = (_parentScopeId && slotSuffix)
    ? _parentScopeId
    : `${name}_${generateId()}`
  const keyAttr = key !== undefined ? ` ${BF_KEY}="${key}"` : ''
  // Slot-relationship markers — only emitted when both host and slot are
  // known; top-level renders without parent context omit them.
  const slotAttrs = (_parentScopeId && slotSuffix)
    ? ` ${BF_HOST}="${_parentScopeId}" ${BF_AT}="${slotSuffix}"`
    : ''
  const bfsAttr = `${BF_SCOPE}="${scopePrefix}${suffix}"`

  if (!templateFn) {
    return `<div ${bfsAttr}${slotAttrs}${keyAttr}></div>`
  }

  // The placeholder substitution is anchored to the exact `bf-s="…"`
  // shape so user content that contains the sentinel as text survives
  // unchanged. When `_parentScopeId` is null (top-level render) the
  // attribute strips rather than emitting `bf-s=""`. (#1320)
  let html = templateFn(props).trim().replace(
    PLACEHOLDER_ATTR_PATTERN,
    _parentScopeId ? ` bf-s="${_parentScopeId}"` : '',
  )
  // Templates may start with comment markers (e.g. <!--bf-cond-start:...-->)
  // so we find the first element tag rather than assuming index 0.
  const firstElMatch = html.match(/<(\w+)/)
  if (!firstElMatch) return html
  const insertPos = firstElMatch.index!
  // Dedupe `bf-s` only when the template body's root already carries
  // one (the body was itself a renderChild call). Still inject
  // `slotAttrs` / `keyAttr` — `data-key` is the reconciliation
  // contract `mapArray` reads, and `bf-h` / `bf-m` mark child
  // membership in the parent scope. (#1320)
  const afterInsert = html.slice(insertPos)
  const extraAttrs = `${slotAttrs}${keyAttr}`
  if (ROOT_HAS_BFS_PATTERN.test(afterInsert)) {
    if (!extraAttrs) return html
    return html.slice(0, insertPos) +
      afterInsert.replace(/^(<\w+)/, `$1${extraAttrs}`)
  }
  return html.slice(0, insertPos) +
    afterInsert.replace(/^(<\w+)/, `$1 ${bfsAttr}${extraAttrs}`)
}

// The leading `\s+` is part of the match so dropping the attribute
// doesn't leave a dangling space; the compiler always emits the
// placeholder preceded by whitespace from an enclosing tag.
const PLACEHOLDER_ATTR_PATTERN = new RegExp(`\\s+bf-s="${BF_PARENT_SCOPE_PLACEHOLDER}"`, 'g')
const ROOT_HAS_BFS_PATTERN = /^<\w+[^>]*\sbf-s="/

/**
 * Generate a random ID for scope identification
 */
function generateId(): string {
  return Math.random().toString(36).slice(2, 8)
}

/**
 * Create a placeholder element when template is not found
 */
function createPlaceholder(name: string, key?: string | number): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute(BF_SCOPE, `${name}_placeholder`)
  if (key !== undefined) {
    el.setAttribute(BF_KEY, String(key))
  }
  el.textContent = `[${name}]`
  el.style.cssText = 'color: red; border: 1px dashed red; padding: 4px;'
  return el
}

/**
 * Unwrap getter props to plain values for template rendering.
 * Template functions need actual values, not getter functions.
 *
 * @param props - Props object (may contain getters)
 * @returns Plain object with unwrapped values
 */
function unwrapPropsForTemplate(props: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const key of Object.keys(props)) {
    const descriptor = Object.getOwnPropertyDescriptor(props, key)

    if (descriptor && typeof descriptor.get === 'function') {
      // It's a getter - call it to get the value
      result[key] = descriptor.get()
    } else {
      // Regular property
      result[key] = props[key]
    }
  }

  // Template functions expect children as an HTML string, not an array.
  // Join non-DOM array children to avoid Array.toString() inserting commas.
  if (Array.isArray(result.children) && !hasDomElements(result.children)) {
    result.children = (result.children as unknown[])
      .flat()
      .map(c => c == null ? '' : String(c))
      .join('')
  }

  return result
}

/**
 * Escape ">" inside HTML attribute values to prevent broken parsing.
 * UnoCSS classes like has-[>svg]:shrink-0 contain ">" which terminates
 * the opening tag when parsed via innerHTML. The browser decodes &gt;
 * back to ">" in the DOM attribute value, preserving CSS matching.
 */
/**
 * Escape ">" inside HTML attribute values to prevent broken parsing.
 * UnoCSS classes like has-[>svg]:shrink-0 contain ">" which terminates
 * the opening tag when parsed via innerHTML. The browser decodes &gt;
 * back to ">" in the DOM attribute value, preserving CSS matching.
 */
export function escapeAttrGt(html: string): string {
  return html.replace(/"[^"]*"/g, match => match.replace(/>/g, '&gt;'))
}

/**
 * HTML-escape a single attribute *value* before it is concatenated into a
 * client-rendered template string. Matches the SSR adapters' attribute
 * escaping (Hono's `escapeToBuffer`: `& " ' < >`) so client-rendered DOM
 * is byte-identical to the server-rendered form and metacharacter-bearing
 * values (UnoCSS `[class*="size-"]`, `has-[>svg]`, …) don't corrupt
 * attribute parsing when the template is inserted via `innerHTML`. `&` is
 * replaced first so the emitted entities aren't themselves re-escaped.
 */
export function escapeAttr(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * HTML-escape interpolated **text content** before it is concatenated into
 * a client-rendered template string (the `<!--bf:sN-->…<!--/-->` text
 * slots). The HTML spec only requires `& < >` in text, but the SSR
 * adapters (Hono) escape text with the same set as attribute values
 * (`& " ' < >`), and the fixture-hydrate / CSR-conformance layer requires
 * byte-parity with the server-rendered output — so the escaping delegates
 * to `escapeAttr`. Kept as a distinct export so generated code reads
 * `escapeText(...)` at text sites (self-documenting) and so the two
 * contexts can diverge (as they now do for nullish) without touching call
 * sites.
 *
 * A nullish value renders as empty text — the JSX/Solid semantics the Hono
 * SSR reference follows (`{undefined}` / `{null}` produce no text), and
 * what the reactive text-update path already does (`claim-slots.ts`'s
 * `writeText`/`writeMarkup` and `dynamic-text.ts` all `String(value ?? '')`).
 * Only this initial-render escape site used to stringify `undefined` /
 * `null` into literal "undefined" / "null" text, so a bare `{props.x}` on
 * an absent prop diverged from SSR at first paint (#2137). Non-nullish
 * values (including `0` and `false`) keep their `String()` form, matching
 * the reactive path.
 */
export function escapeText(value: unknown): string {
  if (value == null) return ''
  return escapeAttr(value)
}

/**
 * `escapeText`'s counterpart for a claimed 'markup' slot's REACTIVE write
 * (slot unification A3 follow-up), where the value is a plain-JS expression
 * that may resolve to either a string or a live `Node` (e.g. `{cond &&
 * logo(id)}`, a hoisted `renderNode` callback, #1213). `writeMarkup`
 * (`claim-slots.ts`) inserts a string via `<template>.innerHTML =`, which —
 * unlike the old `__bfText`'s plain `Text.nodeValue =` assignment — DOES
 * interpret HTML, so a raw un-escaped string is an injection/corruption
 * risk exactly where the initial SSR/CSR TEMPLATE already calls
 * `escapeText` on the same expression (`html-template.ts`'s
 * `escapeTextSlotExpr`). A live `Node`, by contrast, must pass through
 * untouched — `escapeText(node)` would stringify it to garbage, and
 * `writeMarkup`'s own `instanceof Node` check needs the real object to
 * splice in by identity. This is the single call every "dynamic JSX/text
 * slot, value may be a Node" emission site (`emit-reactive.ts`,
 * `stringify/loop-child-arm.ts`, `stringify/insert.ts`) wraps the value in
 * before handing it to a 'markup' writer — NOT the preamble-region case
 * (`stringify/loop.ts`), whose value is already-built HTML from a nested
 * compiled render and must stay unescaped.
 */
export function escapeTextOrNode(value: unknown): string | Node {
  if (typeof Node !== 'undefined' && value instanceof Node) return value
  return escapeText(value)
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Parse an HTML string into a DocumentFragment, safely escaping ">" in
 * attribute values. All code that sets innerHTML on dynamic HTML should
 * use this instead of raw innerHTML assignment.
 *
 * When `parent` is provided and lives in the SVG namespace, the markup
 * is parsed under SVG foreign-content context by wrapping it in
 * `<svg>...</svg>`; the wrapper's children are moved into the returned
 * fragment so callers see the same shape as the HTML path. Without
 * this, dynamically-inserted SVG elements (e.g., a `<path>` in a
 * conditional drag preview) end up as `HTMLUnknownElement` in the
 * xhtml namespace and the SVG renderer ignores them. Surfaced by the
 * Graph/DAG Editor block (#135).
 */
export function parseHTML(html: string, parent?: Element | null): DocumentFragment {
  const tpl = document.createElement('template')
  const escaped = escapeAttrGt(html)
  if (parent && parent.namespaceURI === SVG_NS) {
    tpl.innerHTML = `<svg>${escaped}</svg>`
    const wrapper = tpl.content.firstElementChild
    const frag = document.createDocumentFragment()
    if (wrapper) {
      while (wrapper.firstChild) frag.appendChild(wrapper.firstChild)
    }
    return frag
  }
  tpl.innerHTML = escaped
  return tpl.content
}

/**
 * Check if a value contains DOM elements (HTMLElement instances).
 */
function hasDomElements(value: unknown): boolean {
  if (value instanceof Element) return true
  if (Array.isArray(value)) return value.some(hasDomElements)
  return false
}


/**
 * Insert getter children into an element.
 * Unlike insertDomChildren, strings are parsed as HTML (not text nodes) because
 * getter children may return HTML strings from compiler-generated template literals
 * (e.g. `<span class="...">Required</span>`).
 * Arrays may contain a mix of DOM elements and HTML strings.
 */
function insertGetterChildren(element: HTMLElement, children: unknown): void {
  if (children instanceof Element) {
    element.appendChild(children)
  } else if (Array.isArray(children)) {
    for (const child of (children as unknown[]).flat()) {
      if (child instanceof Element) {
        element.appendChild(child)
      } else if (typeof child === 'string' && child.length > 0) {
        element.appendChild(parseHTML(child.trim()))
      } else if (typeof child === 'number') {
        element.appendChild(document.createTextNode(String(child)))
      }
    }
  } else if (typeof children === 'string' && (children as string).length > 0) {
    element.appendChild(parseHTML((children as string).trim()))
  } else if (typeof children === 'number') {
    element.appendChild(document.createTextNode(String(children)))
  }
}

/**
 * Create a component instance from a ComponentDef (CSR mode).
 * Does not use the component registry — the def is passed directly.
 */
function createComponentFromDef(
  def: ComponentDef,
  props: Record<string, unknown>,
  key?: string | number,
  mountAt?: Element | null,
  rowMount?: { container: Node; anchor: Node | null } | null,
): HTMLElement {
  if (!def.template) {
    throw new Error('[BarefootJS] createComponent with ComponentDef requires a template function')
  }

  // Generate HTML from template
  const unwrappedProps = unwrapPropsForTemplate(props)
  const html = def.template(unwrappedProps)

  // Create DOM element
  const element = parseHTML(html.trim()).firstChild as HTMLElement

  if (!element) {
    const el = document.createElement('div')
    el.textContent = '[ComponentDef]'
    el.style.cssText = 'color: red; border: 1px dashed red; padding: 4px;'
    return el
  }

  // Set scope ID and key
  const name = def.name || def.init.name?.replace(/^init/, '') || 'Component'
  const scopeId = `${name}_${generateId()}`
  element.setAttribute(BF_SCOPE, scopeId)
  if (key !== undefined) {
    element.setAttribute(BF_KEY, String(key))
  }

  // Connect before init, for the same reason the registry path does (see
  // `materializeComponent` step 7b): `def.init` may resolve context by DOM
  // position or measure layout, and neither works detached. Keeps `mountAt`
  // one contract across both modes instead of a registry-only guarantee.
  if (mountAt) {
    mountAt.replaceWith(element)
  } else if (rowMount) {
    rowMount.container.insertBefore(element, rowMount.anchor)
  }

  // Initialize
  def.init(element, props)

  // Mark as initialized
  hydratedScopes.add(element)

  return element
}
