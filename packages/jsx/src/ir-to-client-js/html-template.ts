/**
 * IR → HTML template string generation and validation.
 */

import type { AttrValue, IRAttribute, IRNode, IRProp } from '../types.ts'
import { isBooleanAttr } from '../html-constants.ts'
import { toHtmlAttrName, attrValueToString, quotePropName, PROPS_PARAM, DATA_BF_PH, keyAttrName, loopStartMarker, loopEndMarker, loopItemMarker, freeIdsFromRefs, setIntersects, wrapExprWithLoopParams } from './utils.ts'
import type { LoopParamSpec } from './utils.ts'
import { nameForRegistryRef } from './component-scope.ts'
import { assertNever } from './walker.ts'
import { buildSignalMemoEnv, csrSubstitute, applyPropsRewrite, type CsrEnv } from './csr-substitute.ts'
import type { ClientJsContext } from './types.ts'
import { BF_PARENT_SCOPE_PLACEHOLDER, BF_SCOPE, escapeHtml } from '@barefootjs/shared'
import { buildLoopChainExpr } from '../loop-chain.ts'

/**
 * Protect string literals from regex-based replacements.
 * Returns protect/restore functions that extract string literals before
 * regex replacements and restore them after.
 */
export function createStringProtector(): {
  protect: (s: string) => string
  restore: (s: string) => string
} {
  const strings: string[] = []
  const protect = (s: string): string => {
    return s.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, (match) => {
      const idx = strings.length
      strings.push(match)
      return `__STRLIT_${idx}__`
    })
  }
  const restore = (s: string): string => {
    return s.replace(/__STRLIT_(\d+)__/g, (_, idx) => strings[Number(idx)])
  }
  return { protect, restore }
}

/**
 * Split a template literal body into static segments and `${...}` interpolations,
 * correctly handling nested braces (e.g. object literals inside interpolations).
 */
export function splitTemplateInterpolations(inner: string): string[] {
  const parts: string[] = []
  let i = 0
  let segStart = 0
  while (i < inner.length) {
    if (inner[i] === '$' && inner[i + 1] === '{') {
      if (i > segStart) parts.push(inner.slice(segStart, i))
      let depth = 1
      let j = i + 2
      while (j < inner.length && depth > 0) {
        if (inner[j] === '{') depth++
        else if (inner[j] === '}') depth--
        if (depth > 0) j++
      }
      j++
      parts.push(inner.slice(i, j))
      i = j
      segStart = j
    } else {
      i++
    }
  }
  if (segStart < inner.length) parts.push(inner.slice(segStart))
  return parts
}

/**
 * Protect both template-literal static segments AND quoted string literals
 * from regex-based prop substitution. Used by prop-rewrite.ts (Phase 1)
 * and emit-reactive.ts (Phase 2) to avoid corrupting CSS selectors and
 * class values during prop name replacement.
 */
export function createTemplateAwareStringProtector(): {
  protect: (s: string) => string
  restore: (s: string) => string
} {
  const stash: string[] = []
  const save = (s: string) => { const i = stash.length; stash.push(s); return `__STRLIT_${i}__` }
  const protect = (s: string): string => {
    s = s.replace(/`([^`]*)`/g, (_full, inner: string) => {
      const parts = splitTemplateInterpolations(inner)
      return '`' + parts.map(p => p.startsWith('${') ? p : save(p)).join('') + '`'
    })
    s = s.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, m => save(m))
    return s
  }
  const restore = (s: string): string => {
    return s.replace(/__STRLIT_(\d+)__/g, (_, i) => stash[Number(i)])
  }
  return { protect, restore }
}

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img',
  'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
])

/**
 * Mirror `IRLoop.sortComparator` / `IRLoop.filterPredicate` chaining
 * into the JS expression that backs the SSR-mirror template literal.
 * Pre-#1448-Tier-B this was a silent `node.array` reference — fine
 * when the SSR-side adapter applied the sort separately and
 * hydration only needed to match, broken on Hono / CSR where the
 * template literal is the only source of truth.
 *
 * Delegates to the shared `buildLoopChainExpr` so the
 * `.toSorted` / `.filter` order matches what `utils.ts:buildChainedArrayExpr`
 * (control-flow plans) and `hono-adapter.ts:applyHonoLoopChain` (SSR
 * runtime JSX) emit — drift between the three would silently produce
 * different sorted orders depending on which path consumed the IR.
 *
 * The `base` override lets the CSR-template path pre-substitute
 * props (`_p.items.toSorted(...)`) before the chain rides on top.
 */
function applyLoopChain(loop: import('../types.ts').IRLoop, base: string = loop.array): string {
  return buildLoopChainExpr({
    base,
    sortComparator: loop.sortComparator,
    filterPredicate: loop.filterPredicate,
    chainOrder: loop.chainOrder,
  })
}

/**
 * Wrap an array expression with the iterator shape and build the
 * `.map()` callback parameter for `entries` / `keys` iteration.
 * Returns the (possibly wrapped) array and the callback param string.
 */
function applyIterationShape(
  node: import('../types.ts').IRLoop,
  arrayExpr: string,
  indexParam: string,
): { array: string; callbackParam: string } {
  if (node.iterationShape === 'entries' && node.index) {
    return {
      array: `[...${arrayExpr}.entries()]`,
      callbackParam: `([${node.index}, ${node.param}])`,
    }
  }
  if (node.iterationShape === 'keys') {
    return {
      array: `[...${arrayExpr}.keys()]`,
      callbackParam: `(${node.param})`,
    }
  }
  // `objectIteration` (#2168 object-entries-map): reconstruct the STATIC
  // `Object.entries/keys/values(x)` call the compiler stripped at IR-build
  // time (`isObjectIteratorCall`, `jsx-to-ir.ts`) — `arrayExpr` here is just
  // `x` (the plain object), so the client, unlike a template adapter,
  // re-wraps it in real JS to get the actual entries/keys/values array
  // (this runs in a real JS engine, so no per-language lowering is needed).
  //
  // Unlike the array `iterationShape` case, the 'entries' ARRAY wrap does
  // NOT require `node.index` — that field is only populated for a CLEAN
  // 2-identifier destructure (`([word, n]) => …`); an elided/nested
  // pattern (`([, cfg]) => …`) falls through to the generic `paramBindings`
  // machinery instead (`node.param` stays the raw destructure TEXT, e.g.
  // `"[, cfg]"`, which is already a syntactically valid callback param that
  // correctly destructures a `[key, value]` pair — see the trailing
  // fallback below). Only the ARRAY needs wrapping in that case; the
  // callback param is unaffected either way.
  if (node.objectIteration === 'entries') {
    return {
      array: `Object.entries(${arrayExpr})`,
      callbackParam: node.index
        ? `([${node.index}, ${node.param}])`
        : `(${node.param}${indexParam})`,
    }
  }
  if (node.objectIteration === 'keys') {
    return {
      array: `Object.keys(${arrayExpr})`,
      callbackParam: `(${node.param})`,
    }
  }
  if (node.objectIteration === 'values') {
    return {
      array: `Object.values(${arrayExpr})`,
      callbackParam: `(${node.param})`,
    }
  }
  return { array: arrayExpr, callbackParam: `(${node.param}${indexParam})` }
}

function childrenPropEntry(
  children: IRNode[],
  recurse: (n: IRNode) => string,
): string | null {
  if (children.length === 0) return null
  return `children: \`${children.map(recurse).join('')}\``
}

// #1320 / #1335: emit a `bf-s` placeholder on the top-level hoisted
// element so the runtime can substitute the outer component's scope.
// The bare-element form (`children={<span/>}`) sets `needsScope: true`
// directly; the fragment-wrapped form (`children={<><span/></>}`) is
// unwrapped at IR-collection time (`unwrapHoistedFragment` in
// `jsx-to-ir.ts`) into the same shape, so both forms reach this gate.
function maybeHoistedScopeAttr(
  inHoistedChildren: boolean,
  node: { needsScope?: boolean },
): string | null {
  return inHoistedChildren && node.needsScope
    ? `${BF_SCOPE}="${BF_PARENT_SCOPE_PLACEHOLDER}"`
    : null
}

/**
 * Sentinel returned by the CSR template's `transformExpr` when the expression
 * references an init-body-only name (#1128). Equality with this sentinel is
 * how downstream emit sites decide to drop a renderChild prop, swap a loop
 * array for an empty array literal, or short-circuit a text expression to
 * an empty string. Module-internal — never appears in test fixtures.
 */
const UNSAFE_TEMPLATE_EXPR = 'undefined'

/**
 * Generate a template expression for a dynamic attribute.
 * Unifies boolean, presenceOrUndefined, and generic dynamic attribute handling.
 *
 * - Boolean attrs and presenceOrUndefined: render attribute name when truthy, empty string when falsy
 * - Generic dynamic attrs: render `name="value"` when non-null, empty string otherwise
 *
 * @param attrName - The HTML attribute name
 * @param valExpr - The already-transformed value expression string
 * @param attr - Attribute metadata (only presenceOrUndefined flag is used)
 */
function templateAttrExpr(attrName: string, valExpr: string, presenceOrUndefined?: boolean): string {
  // `dangerouslySetInnerHTML={{ __html }}` is not an attribute — its value
  // becomes the element's raw innerHTML (emitted as element content). Never
  // serialise the `{ __html }` object into a `dangerouslySetInnerHTML="…"`
  // attribute.
  if (attrName === 'dangerouslySetInnerHTML') return ''
  if (isBooleanAttr(attrName) || presenceOrUndefined) {
    return `\${${valExpr} ? '${attrName}' : ''}`
  }
  if (attrName === 'style') {
    return `\${((v) => v != null ? 'style="' + ${escapeAttrValueExpr('v')} + '"' : '')(styleToCss(${valExpr}))}`
  }
  // `data-key` / `data-key-N` is a reconciliation contract — every loop item
  // must carry one. Emit unconditionally; if the user passes `key={undefined}`
  // we want it to surface as `data-key="undefined"` (and ultimately a runtime
  // assertion in mapArray) rather than silently fall back to "no key".
  if (attrName === 'data-key' || attrName.startsWith('data-key-')) {
    return `${attrName}="\${${valExpr}}"`
  }
  return `\${(${valExpr}) != null ? '${attrName}="' + ${escapeAttrValueExpr(valExpr)} + '"' : ''}`
}

/**
 * Build a runtime expression that HTML-escapes an interpolated attribute
 * value, matching the SSR adapters' attribute escaping (Hono escapes
 * `& " ' < >`) via the `escapeAttr` runtime helper. The client template
 * assembles an HTML string inserted via `innerHTML`, so an unescaped `"`
 * / `<` / `>` in a value — e.g. UnoCSS arbitrary variants like
 * `[class*="size-"]` or `has-[>svg]` — corrupts attribute parsing (and
 * diverges from the SSR-rendered bytes). Escaping at interpolation time
 * is the only correct layer: a post-assembly pass can't tell a delimiter
 * `"` from a value `"`.
 */
function escapeAttrValueExpr(valExpr: string): string {
  return `escapeAttr(${valExpr})`
}

/**
 * Build a runtime expression that HTML-escapes an interpolated **text
 * content** slot, via the `escapeText` runtime helper. Only the
 * `<!--bf:sN-->${expr}<!--/-->` text-marker form is text content: the
 * runtime treats whatever sits between the markers as the slot's text, so
 * a string value containing `<` / `&` (e.g. `{user.name}`) must be escaped
 * to parse correctly under `innerHTML` and to match the SSR-rendered
 * bytes. Bare `${...}` interpolations — `{children}` passthrough and
 * `renderChild(...)` output — are pre-rendered HTML and must NOT be
 * escaped, so this is applied only at the four text-marker emit sites.
 * Hono escapes text content with the same set as attribute values
 * (`& " ' < >`), so `escapeText` delegates to the same operation.
 */
function escapeTextSlotExpr(innerExpr: string): string {
  return `escapeText(${innerExpr})`
}

/**
 * `dangerouslySetInnerHTML={{ __html: E }}` makes the element's content its
 * raw innerHTML — the intentional, React-style escape hatch. Returns the
 * raw-content template expression to use *instead of* the element's normal
 * children (emitted UNescaped by design, mirroring the SSR adapters'
 * native handling), or `null` when the element carries no such attribute.
 * The attribute itself is suppressed in `templateAttrExpr`, and the
 * matching reactive update is emitted by `emitAttrUpdate` (assigns
 * `innerHTML`). `toExpr` is the walker's value transform (`wrapExpr` /
 * `transformExpr`) so the `{ __html }` object is lowered the same way an
 * attribute value would be.
 */
function dangerouslyHtmlChildren(
  attrs: ReadonlyArray<IRAttribute>,
  toExpr: (v: { expr: string; templateExpr?: string }) => string,
): string | null {
  const attr = attrs.find(a => a.name === 'dangerouslySetInnerHTML')
  if (!attr || attr.value.kind !== 'expression') return null
  return `\${((${toExpr(attr.value)}) ?? {}).__html ?? ''}`
}

/**
 * Project a prop's `AttrValue` into its JS-expression string form suitable
 * for the `renderChild(..., propsObj, KEY)` `KEY` argument. `transformExpr`
 * applies the constant-inlining / props-rewrite pass used by the CSR
 * template path; for non-`expression`/`spread`/`template` variants we
 * delegate to the canonical projection.
 */
function transformKeyValue(value: AttrValue, transformExpr: (expr: string, templateExpr?: string) => string): string {
  switch (value.kind) {
    case 'expression':
    case 'spread':
      return transformExpr(value.expr, value.templateExpr)
    case 'template':
      return transformExpr(attrValueToString(value, { useTemplate: true }) ?? '')
    case 'literal':
      return JSON.stringify(value.value)
    case 'boolean-shorthand':
    case 'boolean-attr':
      return 'true'
    case 'jsx-children':
      return 'undefined'
  }
}

/**
 * Render one element attribute into its template-literal substring for the
 * SSR template path. Switches on `AttrValue.kind` exhaustively so a new
 * variant becomes a type error.
 *
 * `wrap` is the loop-param-accessor rewrite (`task.title` → `task().title`)
 * applied to any runtime-evaluated expression.
 *
 * Returns `''` to skip the attribute entirely (spread whose source is a
 * known rest-prop, or `jsx-children` which never appears on intrinsic
 * elements in well-formed IR).
 */
function renderTemplateAttrPart(
  attr: IRAttribute,
  attrName: string,
  wrap: (expr: string) => string,
  restSpreadNames?: Set<string>,
): string {
  const v = attr.value
  switch (v.kind) {
    case 'boolean-attr':
      return attrName
    case 'literal':
      return `${attrName}="${escapeHtml(v.value)}"`
    case 'expression': {
      const valExpr = wrap(v.expr)
      return templateAttrExpr(attrName, valExpr, v.presenceOrUndefined)
    }
    case 'template': {
      const tmplStr = attrValueToString(v) ?? ''
      return templateAttrExpr(attrName, wrap(tmplStr))
    }
    case 'spread': {
      if (restSpreadNames?.has(v.expr)) return ''
      // `wrap` lowers loop-param references — including destructured rest
      // bindings (`...rest` lifted via `paramBindings`) — into their item
      // accessor. Skipping it here meant `{...rest}` inside a `.map()`
      // emitted `spreadAttrs(rest)` with `rest` undefined at the render-item
      // scope (#1244).
      return `\${spreadAttrs(${wrap(v.expr)})}`
    }
    case 'boolean-shorthand':
    case 'jsx-children':
      // Neither variant is legal as an intrinsic-element attribute in
      // well-formed IR. Emit nothing rather than crashing.
      return ''
  }
}

/**
 * Source-of-truth predicates for the collision-safe spread-attrs merge
 * shared by all three CSR-side emit paths (`irToHtmlTemplate`,
 * `irToComponentTemplate`, `generateCsrTemplate`). (#1244)
 *
 * Why merge: when a `{...spread}` shares an element with non-`key` user
 * attrs, source-order inline emission silently inverts JSX rightmost-
 * wins on collision. Browser HTML parsing keeps the FIRST occurrence
 * of a duplicate attribute, so `class="x" ${spreadAttrs(rest)}` leaves
 * `class="x"` in the parsed DOM even when `rest.class` should override
 * (rest is to the right in JSX source). The merge collapses both into
 * one `spreadAttrs({merged})` call whose argument is an object literal
 * built in source order — JS object-literal evaluation resolves the
 * rightmost-wins collision before serialization, so the helper sees a
 * deduplicated map and emits a single attribute per key.
 *
 * `key` (which becomes `data-key`) is intentionally kept outside the
 * merge to preserve the unconditional `data-key="${value}"` emit
 * contract (`templateAttrExpr` special-case): `spreadAttrs` skips
 * `undefined` values, so a `key={undefined}` mistake would silently
 * lose its `data-key="undefined"` debug surface inside the merge.
 *
 * The three emit paths share these predicates and the
 * `buildSpreadAttrsMergeCall` builder so the merge contract has a
 * single source of truth. Per-path differences (expression lowering,
 * spread-name detection, `clientOnly` handling) are injected via the
 * `MergeContext` callbacks. Without the consolidation, future fixes
 * could land at one emit site and not the others — exactly the
 * structural drift pattern #1244 §A / §B flagged.
 */
export interface MergeContext {
  /** True when the rest-prop form runtime path handles separately. */
  isFilteredSpread: (v: Extract<AttrValue, { kind: 'spread' }>) => boolean
  /** Whether to honour `attr.clientOnly` (component / CSR template paths do). */
  honorClientOnly: boolean
}

/** Return true if this attribute should participate in the merge object. */
function isMergeableAttr(a: IRAttribute, ctx: MergeContext): boolean {
  if (ctx.honorClientOnly && a.clientOnly) return false
  if (a.name === 'key') return false
  // `dangerouslySetInnerHTML` is not an attribute — its `{ __html }` value
  // becomes the element's raw innerHTML (emitted as content, set via
  // `innerHTML` in init). Keep it out of the `spreadAttrs({...})` merge so
  // it isn't serialised back into a bogus `dangerouslySetInnerHTML="…"`
  // attribute when the element also carries a spread.
  if (a.name === 'dangerouslySetInnerHTML') return false
  const v = a.value
  if (v.kind === 'jsx-children') return false
  if (v.kind === 'boolean-shorthand') return false
  if (v.kind === 'spread') return !ctx.isFilteredSpread(v)
  return true
}

/** Return true if the element should switch to the merge emit form. */
function shouldUseSpreadAttrsMerge(
  attrs: ReadonlyArray<IRAttribute>,
  ctx: MergeContext,
): boolean {
  const hasMergeableSpread = attrs.some(a => {
    if (ctx.honorClientOnly && a.clientOnly) return false
    return a.value.kind === 'spread' && !ctx.isFilteredSpread(a.value)
  })
  if (!hasMergeableSpread) return false
  return attrs.some(a => {
    if (ctx.honorClientOnly && a.clientOnly) return false
    if (a.name === 'key') return false
    const v = a.value
    if (v.kind === 'spread') return false
    if (v.kind === 'jsx-children') return false
    if (v.kind === 'boolean-shorthand') return false
    return true
  })
}

/**
 * Build the `${spreadAttrs({...})}` merge call for an element's
 * already-filtered mergeable attrs (`isMergeableAttr` true for each).
 *
 * Per-path expression lowering is injected through the callbacks so
 * the merge object construction stays adapter-agnostic. The three
 * lowerers correspond to the three emit paths' transform rules
 * (`wrap` for `irToHtmlTemplate`, `transformExpr` with `useTemplate`
 * for the other two).
 */
function buildSpreadAttrsMergeCall(args: {
  attrs: ReadonlyArray<IRAttribute>
  spreadExprFor: (v: Extract<AttrValue, { kind: 'spread' }>) => string
  expressionExprFor: (v: Extract<AttrValue, { kind: 'expression' }>) => string
  templateExprFor: (v: Extract<AttrValue, { kind: 'template' }>) => string
}): string {
  const { attrs, spreadExprFor, expressionExprFor, templateExprFor } = args
  const objMembers: string[] = []
  for (const a of attrs) {
    const v = a.value
    if (v.kind === 'spread') {
      objMembers.push(`...(${spreadExprFor(v)})`)
      continue
    }
    const memberKey = JSON.stringify(toHtmlAttrName(a.name))
    switch (v.kind) {
      case 'boolean-attr':
        objMembers.push(`${memberKey}: true`)
        break
      case 'literal':
        objMembers.push(`${memberKey}: ${JSON.stringify(v.value)}`)
        break
      case 'expression':
        objMembers.push(`${memberKey}: ${expressionExprFor(v)}`)
        break
      case 'template':
        objMembers.push(`${memberKey}: ${templateExprFor(v)}`)
        break
      case 'boolean-shorthand':
      case 'jsx-children':
        // Pre-filtered out by `isMergeableAttr`. Skip defensively.
        break
    }
  }
  return `\${spreadAttrs({${objMembers.join(', ')}})}`
}

/** Convert an IR node tree to an HTML template string (for conditionals/loops).
 *  @param loopDepth - Current nesting depth inside inner loops. 0 = outer loop level.
 *    When > 0, `key` attributes are converted to `data-key-{depth}` instead of `data-key`.
 *  @param branchSlotsVar - When set, Child-position expression interpolations
 *    are wrapped with `__bfSlot(EXPR, <branchSlotsVar>)` so the runtime can
 *    splice live `Node` returns into the parsed fragment instead of
 *    stringifying them via the template literal (#1213).
 *  @param insideLoop - When true, component nodes omit their `slotId` from the
 *    `renderChild` call. Each loop iteration produces its own scope (identified
 *    by `data-key`), so the parent-slot suffix would create scopes that don't
 *    match the SSR shape — see #1268 and the matching `insideLoop` guard in
 *    `generateCsrTemplate` (case `'component'`). Set to `true` when generating
 *    the per-iteration `staticItemTemplate` for static loops.
 */
/**
 * Build the per-item `<!--bf-loop-i:KEY-->` anchor comment for a whole-item
 * conditional loop (#1665), where `keyExpr` is the loop's per-item key
 * expression (e.g. `t.id`). Emits a live `${keyExpr}` interpolation so each
 * rendered item carries its own key — `loopItemMarker` is reserved for
 * already-evaluated key strings (runtime / static contexts).
 */
function itemAnchorTemplate(keyExpr: string): string {
  return `<!--${loopItemMarker('${' + keyExpr + '}')}-->`
}

export function irToHtmlTemplate(node: IRNode, restSpreadNames?: Set<string>, loopDepth = 0, loopParams?: ReadonlyArray<string | LoopParamSpec>, branchSlotsVar?: string, insideLoop = false, inHoistedChildren = false): string {
  const recurse = (n: IRNode): string => irToHtmlTemplate(n, restSpreadNames, loopDepth, loopParams, branchSlotsVar, insideLoop, inHoistedChildren)
  const wrapExpr = (expr: string) => wrapExprWithLoopParams(expr, loopParams)
  const wrapInterpolation = (expr: string): string => branchSlotsVar
    ? `__bfSlot(${expr}, ${branchSlotsVar})`
    : expr

  switch (node.type) {
    case 'element': {
      // Merge context shared with `irToComponentTemplate` /
      // `generateCsrTemplate`. `irToHtmlTemplate` does not honour
      // `clientOnly` (templates here are for conditionals / loops only),
      // and its spread rest-name detector uses `v.expr` directly (no
      // `templateExpr` fallback — those live on the SSR template path).
      const mergeCtx: MergeContext = {
        isFilteredSpread: (v) => !!restSpreadNames?.has(v.expr),
        honorClientOnly: false,
      }
      const useMerge = shouldUseSpreadAttrsMerge(node.attrs, mergeCtx)
      const firstMergeableIdx = useMerge
        ? node.attrs.findIndex(a => isMergeableAttr(a, mergeCtx))
        : -1
      const mergeCall = useMerge
        ? buildSpreadAttrsMergeCall({
            attrs: node.attrs.filter(a => isMergeableAttr(a, mergeCtx)),
            spreadExprFor: (v) => wrapExpr(v.expr),
            expressionExprFor: (v) => wrapExpr(v.expr),
            templateExprFor: (v) => wrapExpr(attrValueToString(v) ?? ''),
          })
        : null

      const attrParts = node.attrs
        .map((a, idx) => {
          if (useMerge && isMergeableAttr(a, mergeCtx)) {
            // Only the first mergeable attr emits the merge call; the
            // others are already represented inside the merge object.
            return idx === firstMergeableIdx ? mergeCall! : ''
          }
          const attrName = a.name === '...'
            ? '...'
            : (a.name === 'key' ? keyAttrName(loopDepth) : toHtmlAttrName(a.name))
          return renderTemplateAttrPart(a, attrName, wrapExpr, restSpreadNames)
        })
        .filter(Boolean)

      const hoistedScopeAttr = maybeHoistedScopeAttr(inHoistedChildren, node)
      if (hoistedScopeAttr) attrParts.push(hoistedScopeAttr)

      if (node.slotId) {
        attrParts.push(`bf="${node.slotId}"`)
      }

      const attrs = attrParts.join(' ')
      const childrenRecurse = (n: IRNode): string => irToHtmlTemplate(n, restSpreadNames, loopDepth, loopParams, branchSlotsVar, insideLoop, false)
      const children = dangerouslyHtmlChildren(node.attrs, v => wrapExpr(v.expr)) ?? node.children.map(childrenRecurse).join('')

      // Non-void elements must use open+close tags (HTML parsers ignore self-closing on div, span, etc.)
      if (children || !VOID_ELEMENTS.has(node.tag)) {
        return `<${node.tag}${attrs ? ' ' + attrs : ''}>${children}</${node.tag}>`
      }
      return `<${node.tag}${attrs ? ' ' + attrs : ''} />`
    }

    case 'text':
      // IRText carries the entity-DECODED value; this string is parsed
      // as HTML (template.innerHTML), so re-escape for the HTML parser.
      return escapeHtml(node.value)

    case 'expression':
      if (node.expr === 'null' || node.expr === 'undefined') return ''
      if (node.slotId) {
        const inner = wrapInterpolation(wrapExpr(node.expr))
        // In branch-slot context `wrapInterpolation` routes the value
        // through `__bfSlot`, which returns raw `<!--bf-slot:N-->` markers
        // for live `Node` values (spliced back by `insert()`). Escaping
        // would corrupt those markers and drop slotted content (#1694
        // regression). `__bfSlot` owns coercion of its own value, so the
        // text-escape applies only to the non-slot (plain text) form.
        const slotted = branchSlotsVar ? inner : escapeTextSlotExpr(inner)
        return `<!--bf:${node.slotId}-->\${${slotted}}<!--/-->`
      }
      return `\${${wrapInterpolation(wrapExpr(node.expr))}}`

    case 'conditional': {
      const trueBranch = recurse(node.whenTrue)
      const falseBranch = recurse(node.whenFalse)
      const trueHtml = node.slotId ? addCondAttrToTemplate(trueBranch, node.slotId) : trueBranch
      const falseHtml = node.slotId ? addCondAttrToTemplate(falseBranch, node.slotId) : falseBranch
      return `\${${wrapExpr(node.condition)} ? \`${trueHtml}\` : \`${falseHtml}\`}`
    }

    case 'fragment':
      return node.children.map(recurse).join('')

    case 'component': {
      // Portal is a special pass-through component - render its children directly
      // Portal moves content to document.body, so we need the actual content in templates
      if (node.name === 'Portal') {
        return node.children.map(recurse).join('')
      }

      // Use renderChild() to render child component's registered template at runtime.
      // This allows stateless components in conditional branches to render their content
      // instead of emitting empty placeholders (#435).
      const propsEntries = node.props
        .filter(p => p.name !== '...' && !p.name.startsWith('...') && p.name !== 'key')
        .filter(p => !(p.name.startsWith('on') && p.name.length > 2 && p.name[2] === p.name[2].toUpperCase()))
        .map(p => {
          // `/* @client */` defers the prop to hydrate via initChild.
          if (p.clientOnly) return null
          switch (p.value.kind) {
            case 'jsx-children': {
              const hoistedRecurse = (n: IRNode): string => irToHtmlTemplate(n, restSpreadNames, loopDepth, loopParams, branchSlotsVar, insideLoop, true)
              const childHtml = p.value.children.map(c => hoistedRecurse(c)).join('')
              return `${quotePropName(p.name)}: \`${childHtml}\``
            }
            case 'literal':
              return `${quotePropName(p.name)}: ${JSON.stringify(p.value.value)}`
            case 'boolean-shorthand':
              return `${quotePropName(p.name)}: true`
            case 'boolean-attr':
              return `${quotePropName(p.name)}: true`
            case 'expression':
            case 'template':
            case 'spread': {
              const expr = attrValueToString(p.value) ?? 'undefined'
              return `${quotePropName(p.name)}: ${expr}`
            }
          }
        })
        .filter((entry): entry is string => entry !== null)
      const childrenEntry = childrenPropEntry(node.children, recurse)
      if (childrenEntry) propsEntries.push(childrenEntry)
      const propsExpr = propsEntries.length > 0 ? `{${propsEntries.join(', ')}}` : '{}'
      const keyProp = node.props.find(p => p.name === 'key')
      const keyArg = keyProp ? `, ${attrValueToString(keyProp.value) ?? 'undefined'}` : ''
      // Pass slotId as suffix so $c() can find the child component by slot
      // after branch swap. Inside a loop body each iteration owns a
      // separate scope (identified by `data-key`), so the parent-slot
      // suffix is dropped to avoid anchoring a deeply-nested child to a
      // wrong component-wrapper scope (#1268).
      const slotArg = (!insideLoop && node.slotId) ? `, '${node.slotId}'` : ''
      return `\${renderChild('${nameForRegistryRef(node.name)}', ${propsExpr}${keyArg || (slotArg ? ', undefined' : '')}${slotArg})}`
    }

    case 'loop': {
      // Generate inline .map().join('') so loop variables are properly scoped
      // Increment loopDepth so inner key attrs become data-key-N
      // Forward loopParams so expressions referencing outer/inner loop params
      // get wrapped as signal accessors (e.g., task.title → task().title).
      // `insideLoop` is preserved (not forced to `true`): downstream branch /
      // inner-loop templates depend on the legacy slot-suffix-keeping shape
      // to find scopes via `findSsrScopeBySlotIn`. The opt-in at the entry
      // call site is the only place that wants the suffix dropped (#1268
      // Case 1 — childComponent body materialize); propagating it through
      // every nested loop regressed form-builder's inner-loop Select wiring.
      const innerRecurse = (n: IRNode): string => irToHtmlTemplate(n, restSpreadNames, loopDepth + 1, loopParams, branchSlotsVar, insideLoop)
      let childTemplate = node.children.map(innerRecurse).join('')
      // Whole-item conditional loops (#1665): prepend an always-present
      // `<!--bf-loop-i:KEY-->` anchor before each item's (possibly empty)
      // conditional content. `mapArrayAnchored` tracks items by this anchor,
      // so an item that renders no element still keeps its identity and slot.
      // The key is a per-item expression, so the marker carries a live
      // `${KEY}` interpolation (not the literal key text).
      if (node.bodyIsItemConditional && node.key) {
        childTemplate = `${itemAnchorTemplate(node.key)}${childTemplate}`
      }
      const indexParam = node.index ? `, ${node.index}` : ''
      // Apply chained sort / filter for the SSR-mirror template (#1448
      // Tier B). Pre-Tier-B this just used `node.array` directly,
      // which silently dropped any chained `.sort()` extracted to
      // `loop.sortComparator` — fine when the SSR-side adapter
      // (Go's `bf_sort`, etc.) applied the sort separately and
      // hydration only needed to match, but broken on Hono / CSR
      // where the template is the only source of truth. The chain
      // mirrors `buildChainedArrayExpr` so reconcileList sees the
      // same array shape this template emits.
      const rawChainedArray = applyLoopChain(node)
      const { array: iterArray, callbackParam } = applyIterationShape(node, rawChainedArray, indexParam)
      const wrappedArray = wrapExpr(iterArray)
      const iterMethod = node.method ?? 'map'
      let mapExpr: string

      if (node.flatMapCallback) {
        // Complex flatMap: use pre-compiled body with JSX placeholders
        let body = node.flatMapCallback.templateBody ?? node.flatMapCallback.body
        for (const frag of node.flatMapCallback.fragments) {
          const renderedIr = irToHtmlTemplate(frag.ir, restSpreadNames, loopDepth + 1, loopParams, branchSlotsVar, insideLoop)
          body = body.replace(frag.placeholder, `\`${renderedIr}\``)
        }
        mapExpr = `\${${wrappedArray}.flatMap(${node.flatMapCallback.params} => ${body}).join('')}`
      } else if (node.mapPreamble) {
        mapExpr = `\${${wrappedArray}.${iterMethod}(${callbackParam} => { ${node.mapPreamble} return \`${childTemplate}\` }).join('')}`
      } else {
        mapExpr = `\${${wrappedArray}.${iterMethod}(${callbackParam} => \`${childTemplate}\`).join('')}`
      }
      // Wrap with loop boundary markers so reconciliation doesn't affect siblings
      return `<!--${loopStartMarker(node.markerId)}-->${mapExpr}<!--${loopEndMarker(node.markerId)}-->`
    }

    case 'if-statement':
      return ''

    case 'provider':
    case 'async':
      return node.children.map(recurse).join('')

    case 'slot':
      // Slots resolve at the host (parent component / template caller); they
      // never appear in the embedded HTML template. Preserves the pre-#1252
      // fall-through behaviour now that the switch is exhaustiveness-checked.
      return ''

    default:
      return assertNever(node)
  }
}

/**
 * Slots a top-level (`mapArray`-driven) loop body proves safe to hoist into a
 * shared, once-per-loop template (perf: avoid per-row `document.createElement
 * ('template')` + innerHTML parse + escapeText/escapeAttr, see
 * `buildLoopSkeletonTemplate`).
 */
export interface LoopSkeletonSafeSlots {
  /** `"<childSlotId>::<attrName>"` pairs already covered by a loop-child reactive-attribute `createEffect`. */
  reactiveAttrKeys: ReadonlySet<string>
  /** Text-marker slot ids already covered by a loop-child reactive-text `createEffect`. */
  reactiveTextSlotIds: ReadonlySet<string>
}

/**
 * Build the STATIC skeleton of a top-level loop body — the shared template
 * cloned once per row instead of re-parsed from a per-row interpolated
 * `innerHTML` string (perf: create-heavy `.map()` loops, see
 * spec/compiler.md "Loop emission shapes").
 *
 * The skeleton keeps every static element / attr / text verbatim, keeps `bf="sN"`
 * marker attributes (needed for `qsa` / `$t` lookups), and keeps text-marker
 * comments (`<!--bf:sN--><!--/-->`) but EMPTIES the interpolation between them.
 * Every dynamic attribute is DROPPED entirely rather than interpolated — both
 * forms rely on the loop-child `createEffect`s (already emitted alongside the
 * clone, see `stringifyReactiveEffects`) to fill in the real value on their
 * eager first run, so nothing is lost — UNLESS a dynamic attr/text isn't
 * proven covered by one of those effects, in which case this function refuses
 * (returns `null`) and the caller falls back to the per-row interpolated
 * template (`irToHtmlTemplate`). `key` is special-cased to an always-empty
 * `data-key=""` placeholder — `mapArray` stamps the real key onto freshly
 * created elements itself (see `map-array.ts`), so the clone path never needs
 * to bake one in.
 *
 * Refuses (returns `null`) on anything not proven safe: spread attrs,
 * `dangerouslySetInnerHTML`, a dynamic attribute/text not present in `safe`,
 * a bare (unslotted) dynamic expression (no DOM anchor to backfill later),
 * conditionals, child components, nested loops, and provider/async/if-statement
 * boundaries. Callers additionally gate on the loop shape itself (single-root,
 * non-static, no `useElementReconciliation`) before invoking this — see
 * `collect-elements.ts`'s `loop` visitor.
 */
export function buildLoopSkeletonTemplate(node: IRNode, safe: LoopSkeletonSafeSlots): string | null {
  switch (node.type) {
    case 'element': {
      const attrParts: string[] = []
      for (const a of node.attrs) {
        if (a.name === '...') return null
        if (a.name === 'dangerouslySetInnerHTML') return null
        if (a.name === 'key') {
          attrParts.push(`${keyAttrName(0)}=""`)
          continue
        }
        const v = a.value
        switch (v.kind) {
          case 'literal':
            attrParts.push(`${toHtmlAttrName(a.name)}="${escapeHtml(v.value)}"`)
            break
          case 'boolean-attr':
            attrParts.push(toHtmlAttrName(a.name))
            break
          case 'boolean-shorthand':
          case 'jsx-children':
            // Never legal on an intrinsic element in well-formed IR — emit nothing.
            break
          case 'expression':
          case 'template': {
            const attrKey = node.slotId ? `${node.slotId}::${a.name}` : null
            if (!attrKey || !safe.reactiveAttrKeys.has(attrKey)) return null
            // Covered by a loop-child createEffect — omit from the skeleton
            // entirely; the effect's eager first run fills it in.
            break
          }
          case 'spread':
            return null
        }
      }

      if (node.slotId) attrParts.push(`bf="${node.slotId}"`)

      const attrs = attrParts.join(' ')
      let children = ''
      for (const child of node.children) {
        const rendered = buildLoopSkeletonTemplate(child, safe)
        if (rendered === null) return null
        children += rendered
      }

      if (children || !VOID_ELEMENTS.has(node.tag)) {
        return `<${node.tag}${attrs ? ' ' + attrs : ''}>${children}</${node.tag}>`
      }
      return `<${node.tag}${attrs ? ' ' + attrs : ''} />`
    }

    case 'text':
      // IRText carries the entity-DECODED value; this string is parsed
      // as HTML (template.innerHTML), so re-escape for the HTML parser.
      return escapeHtml(node.value)

    case 'expression':
      if (node.expr === 'null' || node.expr === 'undefined') return ''
      if (!node.slotId) {
        // No DOM anchor to backfill later — this is a one-time SSR-baked
        // value with no corresponding createEffect. Can't safely omit.
        return null
      }
      if (!safe.reactiveTextSlotIds.has(node.slotId)) return null
      return `<!--bf:${node.slotId}--><!--/-->`

    case 'fragment': {
      let out = ''
      for (const child of node.children) {
        const rendered = buildLoopSkeletonTemplate(child, safe)
        if (rendered === null) return null
        out += rendered
      }
      return out
    }

    // Conditionals, child components, nested loops, and provider/async/
    // if-statement/slot boundaries are all out of scope for the hoisted
    // fast path — the caller falls back to `irToHtmlTemplate`.
    case 'conditional':
    case 'component':
    case 'loop':
    case 'if-statement':
    case 'provider':
    case 'async':
    case 'slot':
      return null

    default:
      return assertNever(node)
  }
}

/**
 * Child-node index paths for a hoisted loop skeleton (perf, #2143): computed
 * alongside `buildLoopSkeletonTemplate` from the SAME IR tree, so the
 * compiler can emit direct `.firstChild`/`.nextSibling` property chains
 * (Solid-style) instead of a per-row `qsa`/`$t` runtime lookup for every
 * dynamic slot in the hoisted single-root loop fast path.
 *
 * Only ever consumed for a FRESH clone of the hoisted skeleton — hydration
 * (`__existing`, real SSR-rendered DOM) keeps using `qsa`/`$t`, since the
 * skeleton's empty text markers and omitted dynamic attrs don't describe the
 * SSR-rendered tree's actual shape (see `computeSkeletonSlotPaths`).
 */
export interface SkeletonSlotPaths {
  /** slotId -> childNodes-index path from the clone root to the element carrying `bf="slotId"`. Empty array = the root itself. */
  elementPaths: ReadonlyMap<string, readonly number[]>
  /** slotId -> path to the first Comment of the `<!--bf:slotId--><!--/-->` marker pair. */
  textMarkerPaths: ReadonlyMap<string, readonly number[]>
}

/**
 * Tags whose HTML-parser behavior can silently restructure or drop children
 * relative to the naive IR-tree model (implied table sections, `<select>`/
 * `<optgroup>` child-dropping, `<p>` auto-close, leading-newline drop in
 * `<pre>`/`<textarea>`, `<template>` content relocating into `.content`). A
 * skeleton containing any of these bails on path computation entirely —
 * the loop keeps its hoisted-clone fast path, but every slot lookup falls
 * back to `qsa`/`$t`.
 */
const SKELETON_PATH_HAZARD_TAGS = new Set([
  'table', 'thead', 'tbody', 'tfoot', 'caption', 'colgroup', 'col',
  'select', 'optgroup',
  'p',
  'pre', 'textarea', 'listing',
  'template',
  'math', // MathML foreign-content: breakout tags pop content back out, same class of hazard as SVG.
])

/**
 * Tag groups the HTML parser force-closes when a tag from the group is
 * nested inside ANY other open tag from the SAME group — not just an
 * identical tag (e.g. `<h2>` inside `<h1>` closes the `<h1>`, `<dd>` inside
 * `<dt>` closes the `<dt>`). A skeleton hitting this bails on path
 * computation entirely (see `SKELETON_PATH_HAZARD_TAGS` doc).
 */
const SKELETON_PATH_FORCE_CLOSE_GROUPS: ReadonlyArray<ReadonlySet<string>> = [
  new Set(['a']),
  new Set(['button']),
  new Set(['form']),
  new Set(['option']),
  new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']),
  new Set(['dd', 'dt']),
  new Set(['li']),
]

function skeletonForceCloseGroup(tag: string): number {
  return SKELETON_PATH_FORCE_CLOSE_GROUPS.findIndex(group => group.has(tag))
}

interface SkeletonPathState {
  elementPaths: Map<string, readonly number[]>
  textMarkerPaths: Map<string, readonly number[]>
  bailed: boolean
}

/**
 * Compute per-slot child-index paths for a loop skeleton already proven
 * safe by `buildLoopSkeletonTemplate` — call this ONLY after that returned
 * non-null for the same `(node, safe)` pair; it assumes the same shape
 * guarantees (no spreads/conditionals/components/nested loops) and does not
 * re-derive them. Returns `null` when the tree contains a parser-hazard tag
 * (see `SKELETON_PATH_HAZARD_TAGS`) that could make the index-path model
 * diverge from the browser's actual parsed structure.
 */
export function computeSkeletonSlotPaths(node: IRNode, safe: LoopSkeletonSafeSlots): SkeletonSlotPaths | null {
  const state: SkeletonPathState = { elementPaths: new Map(), textMarkerPaths: new Map(), bailed: false }
  walkSkeletonPathNode(node, [], safe, state, new Set())
  if (state.bailed) return null
  return { elementPaths: state.elementPaths, textMarkerPaths: state.textMarkerPaths }
}

function walkSkeletonPathNode(
  node: IRNode,
  path: readonly number[],
  safe: LoopSkeletonSafeSlots,
  state: SkeletonPathState,
  forceCloseAncestors: ReadonlySet<number>,
): void {
  if (state.bailed || node.type !== 'element') return
  if (SKELETON_PATH_HAZARD_TAGS.has(node.tag)) { state.bailed = true; return }
  const groupIdx = skeletonForceCloseGroup(node.tag)
  if (groupIdx >= 0 && forceCloseAncestors.has(groupIdx)) { state.bailed = true; return }
  // Void elements never legally carry children; if the IR claims otherwise
  // the browser reparses `</tag>` as stray content instead of a close tag,
  // diverging from the naive one-node-per-element model.
  const flatChildren = flattenSkeletonChildren(node.children)
  if (VOID_ELEMENTS.has(node.tag) && flatChildren.length > 0) { state.bailed = true; return }
  // Foster parenting (#2143 review): a bare `<tr>` root is intentionally NOT
  // in SKELETON_PATH_HAZARD_TAGS (it's the common loop-row shape), but
  // non-`td`/`th` element children — and any non-whitespace text run —
  // directly inside it get foster-parented OUT of the row by the HTML
  // parser, shifting every sibling index after them. Comments (the `bf:sN`
  // marker pairs) are unaffected — comments are inserted in place even in
  // table-related insertion modes.
  if (node.tag === 'tr' && hasForeignTableRowContent(flatChildren)) { state.bailed = true; return }
  if (node.slotId) state.elementPaths.set(node.slotId, path)
  const nextAncestors = groupIdx >= 0
    ? new Set([...forceCloseAncestors, groupIdx])
    : forceCloseAncestors
  walkSkeletonPathChildren(flatChildren, path, safe, state, nextAncestors)
}

/** True if `children` (already flattened) contains anything the HTML parser would foster-parent out of a `<tr>`. */
function hasForeignTableRowContent(children: readonly IRNode[]): boolean {
  for (const child of children) {
    if (child.type === 'text') {
      if (child.value.trim() !== '') return true
      continue
    }
    if (child.type === 'element' && child.tag !== 'td' && child.tag !== 'th') {
      return true
    }
  }
  return false
}

/** Splice fragment children inline — a fragment contributes no DOM node of its own. */
function flattenSkeletonChildren(children: readonly IRNode[]): IRNode[] {
  const out: IRNode[] = []
  for (const child of children) {
    if (child.type === 'fragment') {
      out.push(...flattenSkeletonChildren(child.children))
    } else {
      out.push(child)
    }
  }
  return out
}

/**
 * Walk one level of (already flattened) children, tracking the DOM child
 * index as it will exist on a FRESH clone of the skeleton (empty text
 * markers, no dynamic attrs) — not the per-row interpolated template.
 * Mirrors the browser's text-node-merging behavior: adjacent text content
 * (including a dropped null/undefined expression) collapses into a single
 * Text node; an empty literal string contributes no node at all.
 */
function walkSkeletonPathChildren(
  children: readonly IRNode[],
  parentPath: readonly number[],
  safe: LoopSkeletonSafeSlots,
  state: SkeletonPathState,
  forceCloseAncestors: ReadonlySet<number>,
): void {
  let idx = 0
  let pendingText = false
  for (const child of children) {
    if (state.bailed) return
    switch (child.type) {
      case 'text': {
        if (child.value === '') continue
        if (!pendingText) idx += 1
        pendingText = true
        continue
      }
      case 'expression': {
        if (child.expr === 'null' || child.expr === 'undefined') continue
        if (!child.slotId || !safe.reactiveTextSlotIds.has(child.slotId)) { state.bailed = true; return }
        state.textMarkerPaths.set(child.slotId, [...parentPath, idx])
        idx += 2 // the marker pair: <!--bf:sN--> then <!--/-->
        pendingText = false
        continue
      }
      case 'element': {
        walkSkeletonPathNode(child, [...parentPath, idx], safe, state, forceCloseAncestors)
        idx += 1
        pendingText = false
        continue
      }
      case 'fragment':
        continue // already flattened
      default:
        // conditional/component/loop/if-statement/provider/async/slot: none
        // of these should reach here — buildLoopSkeletonTemplate would have
        // already returned null for the same tree. Bail defensively.
        state.bailed = true
        return
    }
  }
}

/**
 * Generate an HTML template for composite element reconciliation.
 * Identical to irToHtmlTemplate except component nodes become placeholder
 * elements (`<div data-bf-ph="sN"></div>`) instead of renderChild() calls.
 * The placeholders are replaced with real createComponent() elements at runtime.
 */
export function irToPlaceholderTemplate(node: IRNode, restSpreadNames?: Set<string>, loopDepth = 0, loopParams?: ReadonlyArray<string | LoopParamSpec>): string {
  const recurse = (n: IRNode): string => irToPlaceholderTemplate(n, restSpreadNames, loopDepth, loopParams)
  const wrapExpr = (expr: string) => wrapExprWithLoopParams(expr, loopParams)

  switch (node.type) {
    case 'element': {
      const attrParts = node.attrs
        .map((a) => {
          const attrName = a.name === '...'
            ? '...'
            : (a.name === 'key' ? keyAttrName(loopDepth) : toHtmlAttrName(a.name))
          return renderTemplateAttrPart(a, attrName, wrapExpr, restSpreadNames)
        })
        .filter(Boolean)

      if (node.slotId) {
        attrParts.push(`bf="${node.slotId}"`)
      }

      const attrs = attrParts.join(' ')
      const children = dangerouslyHtmlChildren(node.attrs, v => wrapExpr(v.expr)) ?? node.children.map(recurse).join('')

      if (children || !VOID_ELEMENTS.has(node.tag)) {
        return `<${node.tag}${attrs ? ' ' + attrs : ''}>${children}</${node.tag}>`
      }
      return `<${node.tag}${attrs ? ' ' + attrs : ''} />`
    }

    case 'text':
      // IRText carries the entity-DECODED value; this string is parsed
      // as HTML (template.innerHTML), so re-escape for the HTML parser.
      return escapeHtml(node.value)

    case 'expression':
      if (node.expr === 'null' || node.expr === 'undefined') return ''
      if (node.slotId) {
        return `<!--bf:${node.slotId}-->\${${escapeTextSlotExpr(wrapExpr(node.expr))}}<!--/-->`
      }
      return `\${${wrapExpr(node.expr)}}`

    case 'conditional': {
      const trueBranch = recurse(node.whenTrue)
      const falseBranch = recurse(node.whenFalse)
      const trueHtml = node.slotId ? addCondAttrToTemplate(trueBranch, node.slotId) : trueBranch
      const falseHtml = node.slotId ? addCondAttrToTemplate(falseBranch, node.slotId) : falseBranch
      return `\${${wrapExpr(node.condition)} ? \`${trueHtml}\` : \`${falseHtml}\`}`
    }

    case 'fragment':
      return node.children.map(recurse).join('')

    case 'component': {
      // Portal is a pass-through — render children directly
      if (node.name === 'Portal') {
        return node.children.map(recurse).join('')
      }
      // Emit a placeholder div that will be replaced with createComponent() at runtime
      const phId = node.slotId || node.name
      return `<div ${DATA_BF_PH}="${phId}"></div>`
    }

    case 'loop': {
      // Inner loops: generate inline .map().join('') with placeholders for components
      // Forward loopParams so inner loop param expressions get wrapped as signal accessors.
      const innerRecurse = (n: IRNode): string => irToPlaceholderTemplate(n, restSpreadNames, loopDepth + 1, loopParams)
      const childTemplate = node.children.map(innerRecurse).join('')
      const indexParam = node.index ? `, ${node.index}` : ''
      // Apply sort / filter chain (#1448 Tier B) — same shape as the
      // `irToHtmlTemplate` loop case above.
      const rawChainedArray = applyLoopChain(node)
      const { array: iterArray, callbackParam } = applyIterationShape(node, rawChainedArray, indexParam)
      const wrappedArray = wrapExpr(iterArray)
      const iterMethod = node.method ?? 'map'
      let mapExpr: string
      if (node.flatMapCallback) {
        let body = node.flatMapCallback.templateBody ?? node.flatMapCallback.body
        for (const frag of node.flatMapCallback.fragments) {
          const renderedIr = irToPlaceholderTemplate(frag.ir, restSpreadNames, loopDepth + 1, loopParams)
          body = body.replace(frag.placeholder, `\`${renderedIr}\``)
        }
        mapExpr = `\${${wrappedArray}.flatMap(${node.flatMapCallback.params} => ${body}).join('')}`
      } else if (node.mapPreamble) {
        mapExpr = `\${${wrappedArray}.${iterMethod}(${callbackParam} => { ${node.mapPreamble} return \`${childTemplate}\` }).join('')}`
      } else {
        mapExpr = `\${${wrappedArray}.${iterMethod}(${callbackParam} => \`${childTemplate}\`).join('')}`
      }
      return `<!--${loopStartMarker(node.markerId)}-->${mapExpr}<!--${loopEndMarker(node.markerId)}-->`
    }

    case 'if-statement':
      return ''

    case 'provider':
    case 'async':
      return node.children.map(recurse).join('')

    case 'slot':
      return ''

    default:
      return assertNever(node)
  }
}

/**
 * Convert IR children into a JavaScript expression string for createComponent.
 * Produces expressions suitable for use in `get children() { return <expr> }`.
 *
 * - IRComponent → createComponent('Name', { get prop() {...}, get children() {...} })
 * - IRExpression → the expression directly
 * - IRText → JSON string literal
 * - IRElement → template literal via irToHtmlTemplate()
 * - IRFragment → recurse into children
 * - IRConditional → ternary expression
 * - Single child → single expression; multiple → array literal
 */
export function irChildrenToJsExpr(children: IRNode[]): string {
  // Flatten fragments and filter empty text nodes
  const exprs = children.flatMap(c => irNodeToJsExprs(c)).filter(Boolean)
  if (exprs.length === 0) return "''"
  if (exprs.length === 1) return exprs[0]
  return `[${exprs.join(', ')}]`
}

function irNodeToJsExprs(node: IRNode): string[] {
  switch (node.type) {
    case 'component': {
      const propsEntries: string[] = node.props
        .filter(p => p.name !== 'key' && p.name !== '...' && !p.name.startsWith('...'))
        .map(p => {
          if (p.name.startsWith('on') && p.name.length > 2 && p.name[2] === p.name[2].toUpperCase()) {
            return `${quotePropName(p.name)}: ${attrValueToString(p.value) ?? 'undefined'}`
          }
          switch (p.value.kind) {
            case 'jsx-children':
              return `get ${quotePropName(p.name)}() { return ${irChildrenToJsExpr(p.value.children)} }`
            case 'literal':
              return `get ${quotePropName(p.name)}() { return ${JSON.stringify(p.value.value)} }`
            case 'boolean-shorthand':
            case 'boolean-attr':
              return `get ${quotePropName(p.name)}() { return true }`
            case 'expression':
            case 'template':
            case 'spread':
              return `get ${quotePropName(p.name)}() { return ${attrValueToString(p.value) ?? 'undefined'} }`
          }
        })

      if (node.children.length > 0) {
        const childrenExpr = irChildrenToJsExpr(node.children)
        propsEntries.push(`get children() { return ${childrenExpr} }`)
      }

      const propsExpr = propsEntries.length > 0 ? `{ ${propsEntries.join(', ')} }` : '{}'
      return [`createComponent('${nameForRegistryRef(node.name)}', ${propsExpr})`]
    }

    case 'expression':
      if (node.expr === 'null' || node.expr === 'undefined') return []
      return [node.expr]

    case 'text':
      if (!node.value.trim()) return []
      return [JSON.stringify(node.value)]

    case 'element':
      return [`\`${irToHtmlTemplate(node)}\``]

    case 'fragment':
      return node.children.flatMap(c => irNodeToJsExprs(c))

    case 'conditional':
      return [`${node.condition} ? ${irChildrenToJsExpr([node.whenTrue])} : ${irChildrenToJsExpr([node.whenFalse])}`]

    // The kinds below previously fell through to `default: return []` and so
    // were silently dropped when used as a component child. The explicit
    // cases preserve that behaviour but make the exhaustiveness check
    // visible: any new IRNode kind added to the union will now be a
    // compile error here rather than disappearing at runtime (#1252).
    //
    // The historical drop is *not* obviously correct for `provider`,
    // `async`, `if-statement`, or `loop` appearing as a component child;
    // tracking those is a follow-up — this PR only locks in the schema
    // exhaustiveness, not behaviour fixes.
    case 'loop':
    case 'slot':
    case 'if-statement':
    case 'provider':
    case 'async':
      return []

    default:
      return assertNever(node)
  }
}

/**
 * Add bf-c attribute to the first element in an HTML template string.
 * This ensures cond() can find the element for subsequent swaps.
 */
export function addCondAttrToTemplate(html: string, condId: string): string {
  if (/^<\w+/.test(html) && isSingleRootElement(html)) {
    return html.replace(/^(<\w+)(\s|>)/, `$1 bf-c="${condId}"$2`)
  }
  // Text, fragments (multiple sibling elements), or comments use comment markers
  return `<!--bf-cond-start:${condId}-->${html}<!--bf-cond-end:${condId}-->`
}

/** Check if HTML string has a single root element (not multiple siblings). */
function isSingleRootElement(html: string): boolean {
  // Match the opening tag name, then find its closing tag
  const match = html.match(/^<(\w+)[\s>]/)
  if (!match) return false
  const tag = match[1]
  // Self-closing tags like <br/>, <input/>
  if (/^<\w+[^>]*\/>$/.test(html.trim())) return true
  // Check that the last closing tag matches and nothing follows it
  const closingPattern = new RegExp(`</${tag}>\\s*$`)
  return closingPattern.test(html.trim())
}

/**
 * Options for template generation functions (irToComponentTemplate, generateCsrTemplate).
 * Consolidates parameters to prevent argument-passing bugs during recursion.
 */
export interface TemplateOptions {
  inlinableConstants?: Map<string, string>
  restSpreadNames?: Set<string>
  propsObjectName?: string | null
  /**
   * Names that exist only in the init-body scope (or were demoted to unsafe
   * during chained-ref resolution). The CSR template runs at module scope
   * via `render()` / `renderChild()`, so any expression that reaches one
   * of these names would `ReferenceError` at template-call time (#1128).
   *
   * Substitution policy: `transformExpr` returns `UNSAFE_TEMPLATE_EXPR`
   * (the literal token `'undefined'`) whenever the resulting expression
   * still references one of these names. The init function's
   * `createEffect` / `initChild` bindings populate the real value once
   * init runs. Per-context guards (loop array, text expression) translate
   * the sentinel into something safe for that AST position.
   */
  unsafeLocalNames?: Set<string>
  /**
   * Signal+memo substitution env for the CSR template path. Built once
   * per component from `ClientJsContext` (signal initial values + memo
   * bodies, with the `propsObjectName.X → _p.X` props normalization
   * baked in). Constants flow through `inlinableConstants` separately
   * since their `ctx.csrInlinable` entry is already chain-closed by
   * `compute-inlinability` (#1277).
   */
  csrEnv?: CsrEnv
  insideLoop?: boolean
  loopDepth?: number
  /** Emit `bf-s` placeholder on scoped elements inside a jsx-children prop (#1320). */
  inHoistedChildren?: boolean
  /**
   * Slot ids of direct child components whose render must be DEFERRED to
   * init because at least one forwarded (non-`/* @client *\/`) prop value
   * references an init-scope-only / non-inlinable local — the module-scope
   * template lambda can't supply it, so eagerly calling `renderChild` with
   * the prop dropped would make the child template read `undefined`.
   *
   * For these slots the CSR `component` case emits a `data-bf-ph`
   * placeholder instead of `renderChild(...)`; the parent init replaces it
   * via `upsertChild` (→ `createComponent` with the complete getter props).
   * Computed up front by `computeDeferredChildSlots` so the init phase and
   * the template phase agree on which children defer (dropped-prop fix).
   */
  deferredChildSlots?: ReadonlySet<string>
}

/**
 * Generate HTML template for registerTemplate().
 * Used for client-side component creation via createComponent().
 *
 * This is similar to irToHtmlTemplate but:
 * - Expressions are transformed to use the template function's props parameter
 * - Local constant references are inlined with their resolved values (#343)
 * - bf markers ARE included so client code can find elements
 */
export function irToComponentTemplate(
  node: IRNode,
  inlinableConstants?: Map<string, string>,
  restSpreadNames?: Set<string>,
  propsObjectName?: string | null
): string {
  return irToComponentTemplateWithOpts(node, { inlinableConstants, restSpreadNames, propsObjectName, loopDepth: -1 })
}

function irToComponentTemplateWithOpts(node: IRNode, opts: TemplateOptions): string {
  const { inlinableConstants, restSpreadNames, propsObjectName, loopDepth = 0 } = opts
  // `recurse` preserves `inHoistedChildren` for structural pass-through
  // (fragment / conditional); `childrenRecurse` clears it so element
  // descendants don't re-emit the placeholder. (#1320)
  const recurse = (n: IRNode): string => irToComponentTemplateWithOpts(n, opts)
  const childrenRecurse = (n: IRNode): string => irToComponentTemplateWithOpts(n, { ...opts, inHoistedChildren: false })
  // Transform expression for client JS template.
  // Bare prop name prefixing (org → _p.org) is handled by templateExpr
  // from Phase 1 AST rewrite. Only constant inlining and props object
  // normalization are done here. (#807)
  const transformExpr = (expr: string, templateExpr?: string): string => {
    const { protect, restore } = createStringProtector()
    let result = protect(templateExpr ?? expr)

    // Inline constant references with their resolved values (#343)
    if (inlinableConstants && inlinableConstants.size > 0) {
      for (const [constName, constValue] of inlinableConstants) {
        result = result.replace(new RegExp(`(?<![-.])\\b${constName}\\b`, 'g'), `(${protect(constValue)})`)
      }
    }

    // Normalize source-level props object access (e.g., props.xxx → _p.xxx)
    if (propsObjectName && propsObjectName !== PROPS_PARAM) {
      result = result.replace(
        new RegExp(`\\b${propsObjectName}\\.`, 'g'),
        `${PROPS_PARAM}.`,
      )
    }

    return restore(result)
  }

  switch (node.type) {
    case 'element': {
      // When a `{...spread}` shares an element with other non-`key` user
      // attrs, source-order inline emission inverts JSX rightmost-wins on
      // collision (browser HTML parsing keeps the FIRST duplicate). Merge
      // via `spreadAttrs({...source-order...})` so JS object-literal
      // evaluation resolves the collision before serialization. (#1244)
      //
      // Reuses the shared `shouldUseSpreadAttrsMerge` / `isMergeableAttr` /
      // `buildSpreadAttrsMergeCall` helpers so the merge contract has one
      // source of truth across all three CSR-side emit paths. Per-path
      // wiring this path injects:
      //   - `clientOnly` skip (SSR template defers `/* @client */` attrs
      //     to hydrate's `reactiveAttrs`).
      //   - `templateExpr ?? expr` rest-prop detector — the SSR-side
      //     rest-name set is keyed by the template-form expression.
      //   - `transformExpr` (constant inlining + props-object rewrite)
      //     and `useTemplate: true` for template literal AttrValues.
      // `key` stays inline below (outer loops skip it entirely; inner
      // loops emit `data-key-N` unconditionally per the reconciliation
      // contract).
      const mergeCtx: MergeContext = {
        isFilteredSpread: (v) => !!restSpreadNames?.has(v.templateExpr ?? v.expr),
        honorClientOnly: true,
      }
      const useMerge = shouldUseSpreadAttrsMerge(node.attrs, mergeCtx)
      const firstMergeableIdx = useMerge
        ? node.attrs.findIndex(a => isMergeableAttr(a, mergeCtx))
        : -1
      const mergeCall = useMerge
        ? buildSpreadAttrsMergeCall({
            attrs: node.attrs.filter(a => isMergeableAttr(a, mergeCtx)),
            spreadExprFor: (v) => transformExpr(v.expr, v.templateExpr),
            expressionExprFor: (v) => transformExpr(v.expr, v.templateExpr),
            templateExprFor: (v) => transformExpr(attrValueToString(v, { useTemplate: true }) ?? ''),
          })
        : null

      const attrParts = node.attrs
        .map((a, idx) => {
          // `/* @client */` defers the attribute to hydrate via
          // `reactiveAttrs`. Skip from the SSR template so init's
          // createEffect is the sole authority on the attribute.
          if (a.clientOnly) return ''
          const v = a.value
          if (useMerge && isMergeableAttr(a, mergeCtx)) {
            // Only the first mergeable attr emits the merge call.
            return idx === firstMergeableIdx ? mergeCall! : ''
          }
          if (v.kind === 'spread') {
            if (mergeCtx.isFilteredSpread(v)) return ''
            return `\${spreadAttrs(${transformExpr(v.expr, v.templateExpr)})}`
          }
          // Skip key for outer loop elements (reconcileTemplates sets data-key at runtime).
          // But render data-key-N for inner loop elements (needed for event delegation).
          if (a.name === 'key') {
            if (loopDepth === 0) return ''  // outer loop: skip (runtime handles it)
            const keyName = keyAttrName(loopDepth)
            switch (v.kind) {
              case 'expression':
                return templateAttrExpr(keyName, transformExpr(v.expr, v.templateExpr), v.presenceOrUndefined)
              case 'template': {
                const tmplStr = attrValueToString(v, { useTemplate: true }) ?? ''
                return templateAttrExpr(keyName, transformExpr(tmplStr))
              }
              case 'literal':
                return `${keyName}="${escapeHtml(v.value)}"`
              default:
                return ''
            }
          }
          const attrName = toHtmlAttrName(a.name)
          switch (v.kind) {
            case 'boolean-attr':
              return attrName
            case 'literal':
              return `${attrName}="${escapeHtml(v.value)}"`
            case 'expression':
              return templateAttrExpr(attrName, transformExpr(v.expr, v.templateExpr), v.presenceOrUndefined)
            case 'template': {
              const tmplStr = attrValueToString(v, { useTemplate: true }) ?? ''
              return templateAttrExpr(attrName, transformExpr(tmplStr))
            }
            case 'boolean-shorthand':
            case 'jsx-children':
              return ''
          }
        })
        .filter(Boolean)

      const hoistedScopeAttr = maybeHoistedScopeAttr(!!opts.inHoistedChildren, node)
      if (hoistedScopeAttr) attrParts.push(hoistedScopeAttr)

      if (node.slotId) {
        attrParts.push(`bf="${node.slotId}"`)
      }

      const attrs = attrParts.join(' ')
      const children = dangerouslyHtmlChildren(node.attrs, v => transformExpr(v.expr, v.templateExpr)) ?? node.children.map(childrenRecurse).join('')

      if (children || !VOID_ELEMENTS.has(node.tag)) {
        return `<${node.tag}${attrs ? ' ' + attrs : ''}>${children}</${node.tag}>`
      }
      return `<${node.tag}${attrs ? ' ' + attrs : ''} />`
    }

    case 'text':
      // IRText carries the entity-DECODED value; this string is parsed
      // as HTML (template.innerHTML), so re-escape for the HTML parser.
      return escapeHtml(node.value)

    case 'expression':
      if (node.expr === 'null' || node.expr === 'undefined') return ''
      if (node.slotId) {
        return `<!--bf:${node.slotId}-->\${${escapeTextSlotExpr(transformExpr(node.expr, node.templateExpr))}}<!--/-->`
      }
      return `\${${transformExpr(node.expr, node.templateExpr)}}`

    case 'conditional': {
      // A client-only conditional (auto-deferred brand read or manual
      // `/* @client */`) is owned by init's `insert()`, not the module-scope
      // template lambda. Match the SSR adapter: emit empty cond markers so
      // the client-render path (`createComponent`) produces the same DOM SSR
      // does, instead of evaluating an init-scope condition here (#1645).
      if (node.clientOnly && node.slotId) {
        return `<!--bf-cond-start:${node.slotId}--><!--bf-cond-end:${node.slotId}-->`
      }
      const trueBranch = recurse(node.whenTrue)
      const falseBranch = recurse(node.whenFalse)
      const trueHtml = node.slotId ? addCondAttrToTemplate(trueBranch, node.slotId) : trueBranch
      const falseHtml = node.slotId ? addCondAttrToTemplate(falseBranch, node.slotId) : falseBranch
      return `\${${transformExpr(node.condition, node.templateCondition)} ? \`${trueHtml}\` : \`${falseHtml}\`}`
    }

    case 'fragment':
      return node.children.map(recurse).join('')

    case 'component': {
      if (node.name === 'Portal') {
        return node.children.map(recurse).join('')
      }

      // Use renderChild() to render child component's template at runtime (#435)
      const propsEntries = node.props
        .filter(p => p.name !== '...' && !p.name.startsWith('...') && p.name !== 'key')
        .filter(p => !(p.name.startsWith('on') && p.name.length > 2 && p.name[2] === p.name[2].toUpperCase()))
        .map(p => {
          // `/* @client */` defers the prop to hydrate via initChild.
          if (p.clientOnly) return null
          switch (p.value.kind) {
            case 'jsx-children': {
              const hoistedRecurse = (n: IRNode): string => irToComponentTemplateWithOpts(n, { ...opts, inHoistedChildren: true })
              const childHtml = p.value.children.map(c => hoistedRecurse(c)).join('')
              return `${quotePropName(p.name)}: \`${childHtml}\``
            }
            case 'literal':
              return `${quotePropName(p.name)}: ${JSON.stringify(p.value.value)}`
            case 'boolean-shorthand':
            case 'boolean-attr':
              return `${quotePropName(p.name)}: true`
            case 'expression':
              return `${quotePropName(p.name)}: ${transformExpr(p.value.expr, p.value.templateExpr)}`
            case 'spread':
              return `${quotePropName(p.name)}: ${transformExpr(p.value.expr, p.value.templateExpr)}`
            case 'template': {
              const valueStr = attrValueToString(p.value, { useTemplate: true })!
              return `${quotePropName(p.name)}: ${transformExpr(valueStr)}`
            }
          }
        })
        .filter((entry): entry is string => entry !== null)
      const childrenEntry = childrenPropEntry(node.children, recurse)
      if (childrenEntry) propsEntries.push(childrenEntry)
      const propsExpr = propsEntries.length > 0 ? `{${propsEntries.join(', ')}}` : '{}'
      const keyProp = node.props.find(p => p.name === 'key')
      const keyArg = keyProp ? `, ${transformKeyValue(keyProp.value, transformExpr)}` : ''
      return `\${renderChild('${nameForRegistryRef(node.name)}', ${propsExpr}${keyArg})}`
    }

    case 'loop': {
      const innerOpts = { ...opts, loopDepth: loopDepth + 1 }
      const innerRecurse = (n: IRNode): string => irToComponentTemplateWithOpts(n, innerOpts)
      return node.children.map(innerRecurse).join('')
    }

    case 'if-statement': {
      // Lower a component-level multi-return body to a ternary chain
      // (#1401). Previously this case returned `''`, which produced an
      // empty `template:` field — consumers resolving the component via
      // `createComponent(name, props)` then hit the "Template not found"
      // runtime warning and a placeholder rendered. The CSR template
      // path (`generateCsrTemplate`) already handles this shape the
      // same way; mirror it here so the static-template path agrees
      // with the conditional-template path.
      const consequent = recurse(node.consequent)
      const alternate = node.alternate ? recurse(node.alternate) : ''
      return `\${${transformExpr(node.condition, node.templateCondition)} ? \`${consequent}\` : \`${alternate}\`}`
    }

    case 'provider':
    case 'async':
      return node.children.map(recurse).join('')

    case 'slot':
      return ''

    default:
      return assertNever(node)
  }
}

/**
 * Check if a component can have a simple static template generated.
 * Returns false if the component has:
 * - Loops (which use dynamic signal arrays)
 * - Child components (which can't be fully represented in templates)
 * - Signal calls in expressions (like todos().length)
 * - References to local variables not available at module scope (#343)
 *
 * Components that fail this check should not have registerTemplate() generated
 * as the template would reference undefined variables at module scope.
 *
 * @param node - IR node to check
 * @param propNames - Set of prop names (safe to reference via props parameter)
 * @param inlinableConstants - Constants that can be substituted with their values
 * @param unsafeLocalNames - Local names that cannot be used in module-scope templates
 */
export function canGenerateStaticTemplate(
  node: IRNode,
  propNames: Set<string>,
  inlinableConstants?: Map<string, string>,
  unsafeLocalNames?: Set<string>
): boolean {
  const hasUnsafeRef = (freeIds: ReadonlySet<string> | undefined): boolean => {
    return !!(unsafeLocalNames && unsafeLocalNames.size > 0 && setIntersects(freeIds, unsafeLocalNames))
  }

  switch (node.type) {
    case 'loop':
      return false

    case 'component':
      return false

    case 'expression':
      if (hasUnsafeRef(freeIdsFromRefs(node.origin?.freeRefs))) return false
      // Use AST-derived flag when available, fall back to string check for older IR
      if ((node.hasFunctionCalls ?? node.expr.includes('()')) && !isSimplePropExpression(node.expr, propNames)) {
        return false
      }
      return true

    case 'element':
      for (const attr of node.attrs) {
        if (attr.name === '...') {
          // Computed local spreads are now handled by spreadAttrs() at runtime.
          // Only check for unsafe references that would fail at module scope.
          const valueStr = attrValueToString(attr.value)
          if (valueStr && hasUnsafeRef(attr.freeIdentifiers)) return false
          if (valueStr && valueStr.includes('()') && !isSimplePropExpression(valueStr, propNames)) return false
          continue
        }
        // Only `expression` / `template` carry runtime references worth probing.
        if (attr.value.kind === 'expression' || attr.value.kind === 'template' || attr.value.kind === 'spread') {
          const valueStr = attrValueToString(attr.value)
          if (valueStr) {
            if (hasUnsafeRef(attr.freeIdentifiers)) return false
            if (valueStr.includes('()') && !isSimplePropExpression(valueStr, propNames)) {
              return false
            }
          }
        }
      }
      return node.children.every((c) => canGenerateStaticTemplate(c, propNames, inlinableConstants, unsafeLocalNames))

    case 'conditional':
      if (hasUnsafeRef(freeIdsFromRefs(node.origin?.freeRefs))) return false
      if (node.condition.includes('()') && !isSimplePropExpression(node.condition, propNames)) {
        return false
      }
      return canGenerateStaticTemplate(node.whenTrue, propNames, inlinableConstants, unsafeLocalNames) &&
             canGenerateStaticTemplate(node.whenFalse, propNames, inlinableConstants, unsafeLocalNames)

    case 'fragment':
      return node.children.every((c) => canGenerateStaticTemplate(c, propNames, inlinableConstants, unsafeLocalNames))

    case 'if-statement':
      if (!canGenerateStaticTemplate(node.consequent, propNames, inlinableConstants, unsafeLocalNames)) {
        return false
      }
      if (node.alternate && !canGenerateStaticTemplate(node.alternate, propNames, inlinableConstants, unsafeLocalNames)) {
        return false
      }
      return true

    case 'provider':
    case 'async':
      return node.children.every((c) => canGenerateStaticTemplate(c, propNames, inlinableConstants, unsafeLocalNames))

    case 'text':
      return true

    case 'slot':
      // Slots resolve at the host — they don't disqualify static generation
      // on their own. Preserves the pre-#1252 `default: true` behaviour.
      return true

    default:
      return assertNever(node)
  }
}

/**
 * Generate HTML template for CSR mode.
 * Unlike irToComponentTemplate(), this handles stateful components:
 * - Signal getter calls (e.g., count()) are replaced with initial value expressions
 * - Memo getter calls (e.g., doubled()) are replaced with their computation expressions
 * - Loops generate .map().join('') for inline rendering
 * - Child components use renderChild() for runtime template lookup
 *
 * The substitution data — signal initial values, memo bodies, and the
 * chain-closed inlinable-const values — comes from
 * `SignalInfo.initialFreeIdentifiers` / `MemoInfo.computationFreeIdentifiers`
 * (core IR) and `ctx.csrInlinable` (CSR-internal side map populated by
 * `compute-inlinability`, #1277). `csrSubstitute` walks the AST so
 * member-access shadowing (`ctx.bars()`) is preserved structurally
 * instead of via the legacy `(?<![-.])` lookbehind.
 *
 * @param node - IR node to render
 * @param inlinableConstants - Map of constant names to their resolved CSR values
 * @param ctx - ClientJsContext supplying signals/memos for `csrSubstitute`
 */
export function generateCsrTemplate(
  node: IRNode,
  inlinableConstants: Map<string, string> | undefined,
  ctx: ClientJsContext,
  insideLoop?: boolean,
  restSpreadNames?: Set<string>,
  propsObjectName?: string | null,
  unsafeLocalNames?: Set<string>,
  deferredChildSlots?: ReadonlySet<string>,
): string {
  // Build the substitution env once per component. Signals + memos come
  // from `buildSignalMemoEnv`; inlinable constants layer in here so
  // each call to `transformExpr` is a pure AST projection over the
  // shared env (no per-call Map cloning).
  const base = buildSignalMemoEnv(ctx.signals, ctx.memos, propsObjectName ?? null)
  const csrEnv: CsrEnv = { substitutions: new Map(base.substitutions), propsObjectName: base.propsObjectName }
  if (inlinableConstants) {
    for (const [name, value] of inlinableConstants) {
      if (!csrEnv.substitutions.has(name)) {
        csrEnv.substitutions.set(name, { kind: 'identifier', replacement: value, freeIdentifiers: new Set() })
      }
    }
  }
  const effectiveUnsafeLocalNames = mergeCsrNullUnsafe(ctx, unsafeLocalNames)
  return generateCsrTemplateWithOpts(node, { inlinableConstants, restSpreadNames, propsObjectName, csrEnv, insideLoop, unsafeLocalNames: effectiveUnsafeLocalNames, deferredChildSlots, loopDepth: -1 })
}

/**
 * Fold `ctx.csrInlinable`'s null verdicts into `unsafeLocalNames`, so
 * `generateCsrTemplate`'s callers can't independently drift out of sync
 * with `ctx.csrInlinable` (#2106).
 *
 * The two "is this constant's value safe to inline into a module-scope
 * template" checks in `compute-inlinability.ts` can legitimately disagree:
 *
 *   - Stage-2 classification (`classifyConstantInitial`) runs
 *     `isInlinableInTemplate` on the RAW initializer text — deliberately,
 *     so it can still see bridged prop args (`useYjs(props.X)`) for the
 *     #1138 rejection. A call whose raw receiver is an identifier path
 *     (`someModuleArray.includes(name)`) can pass this check (e.g. an
 *     adapter with a broad `acceptsTemplateCall` accepts any
 *     identifier-path callee) even though `name` is a bridged prop arg.
 *   - `populateCsrInlinable` re-runs the same check on the
 *     CSR-*substituted* form, where `someModuleArray` has already been
 *     literal-inlined (`['a','b'].includes(name)`). The callee is no
 *     longer an identifier path at all, so the adapter can't vouch for
 *     it, and the bridged-arg rejection correctly fires — recorded as
 *     `ctx.csrInlinable.get(name) === null`.
 *
 * `unsafeLocalNames` (passed in from the Stage-2-derived
 * `toLegacyInlinability` result) only reflects the first, looser verdict,
 * so a name `populateCsrInlinable` refused could still be missing from
 * it. Left alone, `transformExpr` below finds no CSR substitution for the
 * name (`inlinableConstants` — built from `ctx.csrInlinable` by the
 * caller — excludes null entries) AND no unsafe flag, so the bare,
 * module-scope-invisible identifier leaks straight into the emitted
 * template text (`ReferenceError` at template evaluation, #2106).
 *
 * `ctx.csrInlinable` is the ground truth for the CSR path — this makes it
 * the single source added to (never subtracted from) the effective
 * unsafe set used below: any post-substitution refusal is unsafe here,
 * full stop, regardless of what the looser Stage-2 check concluded.
 * Doing this once, inside `generateCsrTemplate` itself, means every
 * caller (the full-init path in `emit-registration.ts` AND the
 * template-only path in `index.ts`) gets the correction for free instead
 * of each needing to remember to fold `ctx.csrInlinable` in themselves.
 *
 * System-construct (`createContext()`, `new WeakMap()`) and JSX-inline
 * constants are exempted even though `populateCsrInlinable` also marks
 * them `null` — that's "not applicable" routing (module-scope singleton
 * referenced by name at runtime / already inlined at IR level), not an
 * unsafe reference, and `toLegacyInlinability` never treated them as
 * unsafe either.
 */
function mergeCsrNullUnsafe(ctx: ClientJsContext, unsafeLocalNames: Set<string> | undefined): Set<string> | undefined {
  let merged: Set<string> | null = null
  // Built lazily on the first null verdict, so the common all-inlinable
  // component pays nothing; a Set keeps the merge linear in the number
  // of local constants instead of a per-name `.find()` scan.
  let exemptNames: Set<string> | null = null
  for (const [name, entry] of ctx.csrInlinable) {
    if (entry !== null || unsafeLocalNames?.has(name)) continue
    exemptNames ??= new Set(ctx.localConstants.filter((c) => c.isJsx || c.systemConstructKind).map((c) => c.name))
    if (exemptNames.has(name)) continue
    if (!merged) merged = new Set(unsafeLocalNames ?? [])
    merged.add(name)
  }
  return merged ?? unsafeLocalNames
}

/**
 * Build the per-component CSR substitution env (signals + memos + inlinable
 * constants), matching what `generateCsrTemplate` builds. Shared so the
 * deferred-child analysis and the template emit agree on substitution
 * results.
 */
function buildCsrEnvForCtx(
  ctx: ClientJsContext,
  inlinableConstants: Map<string, string> | undefined,
  propsObjectName?: string | null,
): CsrEnv {
  const base = buildSignalMemoEnv(ctx.signals, ctx.memos, propsObjectName ?? null)
  const csrEnv: CsrEnv = { substitutions: new Map(base.substitutions), propsObjectName: base.propsObjectName }
  if (inlinableConstants) {
    for (const [name, value] of inlinableConstants) {
      if (!csrEnv.substitutions.has(name)) {
        csrEnv.substitutions.set(name, { kind: 'identifier', replacement: value, freeIdentifiers: new Set() })
      }
    }
  }
  return csrEnv
}

/**
 * Decide whether a single forwarded component prop value would be DROPPED
 * by the CSR `component` emit — i.e. after `csrSubstitute` its expression
 * still references a name in `unsafeLocalNames`. Mirrors the
 * `transformExpr` UNSAFE gate so the deferral analysis matches the actual
 * template output exactly.
 */
function propResolvesUnsafe(
  prop: IRProp,
  env: CsrEnv,
  unsafeLocalNames: ReadonlySet<string>,
): boolean {
  if (unsafeLocalNames.size === 0) return false
  let source: string | undefined
  switch (prop.value.kind) {
    case 'expression':
    case 'spread':
      source = prop.value.expr
      break
    case 'template':
      source = attrValueToString(prop.value, { useTemplate: true }) ?? undefined
      break
    default:
      // literal / boolean / jsx-children carry no init-scope identifiers.
      return false
  }
  if (!source) return false
  const { freeIdentifiers } = csrSubstitute(source, env)
  return setIntersects(freeIdentifiers, unsafeLocalNames)
}

/**
 * Walk the component IR and collect the slot ids of DIRECT child
 * components whose render must be deferred to init because at least one
 * forwarded (non-`/* @client *\/`, non-event) prop resolves to an
 * init-scope-only / non-inlinable local. The module-scope CSR template
 * lambda can't supply such a value, so `renderChild(...)` would drop the
 * prop and the child template would read `undefined` and throw.
 *
 * Only top-level (non-loop, non-clientOnly-conditional) children are
 * considered — those are the ones rendered via the `renderChild(...)` form
 * in the registration template and wired through `ctx.childInits`. Loop /
 * conditional-branch children already go through their own
 * placeholder + `createComponent` materialize paths.
 */
export function computeDeferredChildSlots(
  node: IRNode,
  ctx: ClientJsContext,
  inlinableConstants: Map<string, string> | undefined,
  unsafeLocalNames: ReadonlySet<string> | undefined,
  propsObjectName?: string | null,
): Set<string> {
  const deferred = new Set<string>()
  if (!unsafeLocalNames || unsafeLocalNames.size === 0) return deferred
  const env = buildCsrEnvForCtx(ctx, inlinableConstants, propsObjectName)

  const visit = (n: IRNode): void => {
    switch (n.type) {
      case 'component': {
        if (n.name === 'Portal') {
          n.children.forEach(visit)
          return
        }
        if (n.slotId) {
          const dropped = n.props.some(p => {
            // Spread props (`...`) are forwarded via the rest-spread path
            // (`restSpreadNames`), not the per-prop inline form, so they are
            // out of scope for this drop check; `key` and event handlers
            // (`onX`) likewise never carry init-scope render values. This
            // filter set MUST mirror the `propsEntries` filter in the CSR
            // `component` emit below so the deferral decision matches output.
            if (p.name === '...' || p.name.startsWith('...') || p.name === 'key') return false
            if (p.name.startsWith('on') && p.name.length > 2 && p.name[2] === p.name[2].toUpperCase()) return false
            if (p.clientOnly) return false
            return propResolvesUnsafe(p, env, unsafeLocalNames)
          })
          if (dropped) deferred.add(n.slotId)
        }
        // Do not descend into a component's JSX-children props here: those
        // children render in the parent scope only when hoisted, and the
        // deferral concern is the direct child component's own props.
        return
      }
      case 'element':
        n.children.forEach(visit)
        return
      case 'fragment':
        n.children.forEach(visit)
        return
      case 'conditional':
        // Conditional branch children are handled by the branch
        // materialize path, not the top-level renderChild form.
        return
      case 'loop':
        // Loop children go through the loop materialize path.
        return
      default:
        return
    }
  }
  visit(node)
  return deferred
}

function generateCsrTemplateWithOpts(node: IRNode, opts: TemplateOptions): string {
  const { restSpreadNames, propsObjectName, csrEnv, insideLoop, unsafeLocalNames, loopDepth = 0 } = opts
  const env: CsrEnv = csrEnv ?? { substitutions: new Map(), propsObjectName: propsObjectName ?? null }
  const transformExpr = (expr: string, templateExpr?: string): string => {
    // Single AST substitution pass: replaces signal getter calls
    // (`count()` → `(initialValue)`), memo calls (`bars()` → `(body)`),
    // and inlinable-const refs (`label` → `(rewrittenValue)`) in one
    // walk. The walker uses structural position checks instead of
    // regex lookbehind, so `ctx.bars()` survives intact when a local
    // memo `bars` exists (#1100). All substitution values come from
    // the IR — emit does no string transformation of its own (#1277).
    const source = templateExpr ?? expr
    if (!source) return source
    const { rewritten, freeIdentifiers } = csrSubstitute(source, env)

    // The CSR template runs at module scope, so any post-substitution
    // free identifier that lands in `unsafeLocalNames` (init-body-only
    // bindings, demoted const refs) is unreachable. Surface the UNSAFE
    // sentinel; per-AST-context call sites translate it (loop array →
    // `[]`, text expression → `''`, child component prop → drop) and
    // init's createEffect / initChild bindings repaint the real value
    // once init runs (#1128).
    //
    // The check is now a pure set intersection of IR-tracked
    // identifiers; the legacy `tokenContainsAny` lexer scan
    // (and its `'foo-className'` / `a.className` false-match risk)
    // is gone (#1267 / #1277).
    if (unsafeLocalNames && unsafeLocalNames.size > 0 && setIntersects(freeIdentifiers, unsafeLocalNames)) {
      return UNSAFE_TEMPLATE_EXPR
    }
    // Final emit-form: rewrite `propsName.X → _p.X`. Deferred until
    // after the unsafe-name check because the check used raw form
    // (consistent with `populateCsrInlinable`'s `isInlinableInTemplate`
    // gate — #1138).
    return applyPropsRewrite(rewritten, propsObjectName ?? null)
  }

  // `recurse` preserves `inHoistedChildren` for structural pass-through
  // (fragment / conditional); `childrenRecurse` and `recurseInLoop`
  // clear it — a new element root or loop iteration starts a fresh
  // scope. (#1320)
  const recurse = (n: IRNode): string => generateCsrTemplateWithOpts(n, opts)
  const childrenRecurse = (n: IRNode): string => generateCsrTemplateWithOpts(n, { ...opts, inHoistedChildren: false })
  const recurseInLoop = (n: IRNode): string => generateCsrTemplateWithOpts(n, { ...opts, insideLoop: true, loopDepth: loopDepth + 1, inHoistedChildren: false })

  switch (node.type) {
    case 'element': {
      // Same JSX-rightmost-wins merge rationale as `irToHtmlTemplate` /
      // `irToComponentTemplate`: a `{...spread}` mixed with non-`key`
      // explicit attrs collapses into one `spreadAttrs({...})` call so
      // JS object-literal evaluation resolves rightmost-wins before
      // serialization. (#1244) The same shared helpers
      // (`shouldUseSpreadAttrsMerge`, `isMergeableAttr`,
      // `buildSpreadAttrsMergeCall`) keep the contract aligned with
      // the other two CSR-side emit paths.
      const mergeCtx: MergeContext = {
        isFilteredSpread: (v) => !!restSpreadNames?.has(v.templateExpr ?? v.expr),
        honorClientOnly: true,
      }
      const useMerge = shouldUseSpreadAttrsMerge(node.attrs, mergeCtx)
      const firstMergeableIdx = useMerge
        ? node.attrs.findIndex(a => isMergeableAttr(a, mergeCtx))
        : -1
      const mergeCall = useMerge
        ? buildSpreadAttrsMergeCall({
            attrs: node.attrs.filter(a => isMergeableAttr(a, mergeCtx)),
            spreadExprFor: (v) => transformExpr(v.expr, v.templateExpr),
            expressionExprFor: (v) => transformExpr(v.expr, v.templateExpr),
            templateExprFor: (v) => transformExpr(attrValueToString(v, { useTemplate: true }) ?? ''),
          })
        : null

      const attrParts = node.attrs
        .map((a, idx) => {
          // `/* @client */` defers the attribute to hydrate. The
          // `reactiveAttrs` push in collect-elements wires a
          // `createEffect` that sets the attribute via the existing
          // hydrate-time path; the SSR template must not race that
          // by emitting an initial value, so skip the attribute
          // entirely here.
          if (a.clientOnly) return ''
          const v = a.value
          if (useMerge && isMergeableAttr(a, mergeCtx)) {
            // Only the first mergeable attr emits the merge call.
            return idx === firstMergeableIdx ? mergeCall! : ''
          }
          if (v.kind === 'spread') {
            if (mergeCtx.isFilteredSpread(v)) return ''
            return `\${spreadAttrs(${transformExpr(v.expr, v.templateExpr)})}`
          }
          const attrName = a.name === 'key'
            ? keyAttrName(loopDepth)
            : toHtmlAttrName(a.name)
          switch (v.kind) {
            case 'boolean-attr':
              return attrName
            case 'literal':
              return `${attrName}="${escapeHtml(v.value)}"`
            case 'expression':
              return templateAttrExpr(attrName, transformExpr(v.expr, v.templateExpr), v.presenceOrUndefined)
            case 'template': {
              const valueStr = attrValueToString(v, { useTemplate: true })
              return valueStr ? templateAttrExpr(attrName, transformExpr(valueStr)) : ''
            }
            case 'boolean-shorthand':
            case 'jsx-children':
              return ''
          }
        })
        .filter(Boolean)

      const hoistedScopeAttr = maybeHoistedScopeAttr(!!opts.inHoistedChildren, node)
      if (hoistedScopeAttr) attrParts.push(hoistedScopeAttr)

      if (node.slotId) {
        attrParts.push(`bf="${node.slotId}"`)
      }

      const attrs = attrParts.join(' ')
      const children = dangerouslyHtmlChildren(node.attrs, v => transformExpr(v.expr, v.templateExpr)) ?? node.children.map(childrenRecurse).join('')

      if (children || !VOID_ELEMENTS.has(node.tag)) {
        return `<${node.tag}${attrs ? ' ' + attrs : ''}>${children}</${node.tag}>`
      }
      return `<${node.tag}${attrs ? ' ' + attrs : ''} />`
    }

    case 'text':
      // IRText carries the entity-DECODED value; this string is parsed
      // as HTML (template.innerHTML), so re-escape for the HTML parser.
      return escapeHtml(node.value)

    case 'expression':
      if (node.expr === 'null' || node.expr === 'undefined') return ''
      if (node.clientOnly && node.slotId) {
        return `<!--bf-client:${node.slotId}--><!--/-->`
      }
      {
        const transformed = transformExpr(node.expr, node.templateExpr)
        // Init-body-only refs would render the literal text "undefined"
        // before init's createEffect overwrites the slot (#1128). Emit
        // an empty placeholder instead.
        const expr = transformed === UNSAFE_TEMPLATE_EXPR ? "''" : transformed
        if (node.slotId) {
          return `<!--bf:${node.slotId}-->\${${escapeTextSlotExpr(expr)}}<!--/-->`
        }
        return `\${${expr}}`
      }

    case 'conditional': {
      // An auto-deferred conditional (e.g. `{form.field('x').error() && …}`)
      // reads per-instance init-scope state the module-scope template lambda
      // can't evaluate — re-deriving it here yields `undefined.field(...)` or
      // a throwaway re-inlined `createForm({...})`. Match the SSR adapter:
      // emit empty cond markers and let init's `insert()` populate the branch
      // at hydrate time via the reactive binding (#1645).
      if (node.clientOnly && node.slotId) {
        return `<!--bf-cond-start:${node.slotId}--><!--bf-cond-end:${node.slotId}-->`
      }
      const trueBranch = recurse(node.whenTrue)
      const falseBranch = recurse(node.whenFalse)
      const trueHtml = node.slotId ? addCondAttrToTemplate(trueBranch, node.slotId) : trueBranch
      const falseHtml = node.slotId ? addCondAttrToTemplate(falseBranch, node.slotId) : falseBranch
      return `\${${transformExpr(node.condition, node.templateCondition)} ? \`${trueHtml}\` : \`${falseHtml}\`}`
    }

    case 'fragment':
      return node.children.map(recurse).join('')

    case 'component': {
      if (node.name === 'Portal') {
        return node.children.map(recurse).join('')
      }

      // Deferred child (dropped-prop fix): at least one forwarded prop
      // resolves to an init-scope-only local the module-scope template
      // lambda can't supply. Emitting `renderChild('Child', { /* prop
      // dropped */ })` would make the child template read `undefined` and
      // throw. Emit a `data-bf-ph` placeholder instead — the parent init
      // resolves it via `upsertChild` → `createComponent` with the full
      // getter props (mirrors the `irToPlaceholderTemplate` deferral and
      // the clientOnly-conditional empty-marker precedent).
      if (node.slotId && opts.deferredChildSlots?.has(node.slotId)) {
        return `<div ${DATA_BF_PH}="${node.slotId}"></div>`
      }

      const propsEntries = node.props
        .filter(p => p.name !== '...' && !p.name.startsWith('...') && p.name !== 'key')
        .filter(p => !(p.name.startsWith('on') && p.name.length > 2 && p.name[2] === p.name[2].toUpperCase()))
        .map(p => {
          // `/* @client */` defers the prop to hydrate. Drop from the
          // SSR `renderChild` props — `initChild`'s `propsExpr` getter
          // (built in collect-elements) reads the value once init
          // runs, mirroring the existing UNSAFE strip path below.
          if (p.clientOnly) return null
          switch (p.value.kind) {
            case 'jsx-children': {
              const hoistedRecurse = (n: IRNode): string => generateCsrTemplateWithOpts(n, { ...opts, inHoistedChildren: true })
              const childHtml = p.value.children.map(c => hoistedRecurse(c)).join('')
              return `${quotePropName(p.name)}: \`${childHtml}\``
            }
            case 'literal':
              return `${quotePropName(p.name)}: ${JSON.stringify(p.value.value)}`
            case 'boolean-shorthand':
            case 'boolean-attr':
              return `${quotePropName(p.name)}: true`
            case 'expression':
            case 'spread': {
              const transformed = transformExpr(p.value.expr, p.value.templateExpr)
              // When transformExpr emits the unsafe sentinel for an init-scope-only
              // reference (#1128), drop the prop from renderChild — initChild's
              // getter binding will populate it once init runs.
              if (transformed === UNSAFE_TEMPLATE_EXPR) return null
              return `${quotePropName(p.name)}: ${transformed}`
            }
            case 'template': {
              const valueStr = attrValueToString(p.value, { useTemplate: true })
              if (!valueStr) return null
              const transformed = transformExpr(valueStr)
              if (transformed === UNSAFE_TEMPLATE_EXPR) return null
              return `${quotePropName(p.name)}: ${transformed}`
            }
          }
        })
        .filter((entry): entry is string => entry !== null)
      const childrenEntry = childrenPropEntry(node.children, recurse)
      if (childrenEntry) propsEntries.push(childrenEntry)
      const propsExpr = propsEntries.length > 0 ? `{${propsEntries.join(', ')}}` : '{}'
      const keyProp = node.props.find(p => p.name === 'key')
      const keyArg = keyProp ? `, ${transformKeyValue(keyProp.value, transformExpr)}` : ''
      const slotArg = (!insideLoop && node.slotId) ? `, '${node.slotId}'` : ''
      return `\${renderChild('${nameForRegistryRef(node.name)}', ${propsExpr}${keyArg || (slotArg ? ', undefined' : '')}${slotArg})}`
    }

    case 'loop': {
      let childTemplate = node.children.map(recurseInLoop).join('')
      // Whole-item conditional loops (#1665): prepend the per-item
      // `<!--bf-loop-i:KEY-->` anchor so `mapArrayAnchored` can track items
      // that render no element. Mirrors the `irToHtmlTemplate` loop case.
      if (node.bodyIsItemConditional && node.key) {
        childTemplate = `${itemAnchorTemplate(node.key)}${childTemplate}`
      }
      const indexParam = node.index ? `, ${node.index}` : ''
      // An init-scope-only array would `undefined.map(...)` ⇒ TypeError.
      // Substitute an empty array; init's reconcile pass populates the loop
      // once the real binding exists (#1128).
      //
      // Sort / filter chain (#1448 Tier B): when the loop carries a
      // `sortComparator` or `filterPredicate`, fold them into the
      // un-substituted form (`applyLoopChain(node)`) and let
      // `transformExpr` rewrite bare prop refs through csrSubstitute.
      // Pre-Tier-B this used `node.templateArray` directly, which
      // never carried the chain — fine for adapters that applied
      // sort separately, broken on Hono / CSR where the template
      // literal is the only source.
      // Build the chained template form on top of `node.templateArray`
      // (already prop-substituted) so the chain inherits the same
      // `_p.X` rewrites the pre-Tier-B path used.
      const chainedTemplateArray = node.sortComparator || node.filterPredicate
        ? applyLoopChain(node, node.templateArray)
        : node.templateArray
      const rawArrayExpr = transformExpr(node.array, chainedTemplateArray)
      const safeRawArrayExpr = rawArrayExpr === UNSAFE_TEMPLATE_EXPR ? '[]' : rawArrayExpr
      const { array: iterArrayExpr, callbackParam } = applyIterationShape(node, safeRawArrayExpr, indexParam)
      const iterMethod = node.method ?? 'map'
      let mapExpr: string
      if (node.flatMapCallback) {
        let body = node.flatMapCallback.templateBody ?? node.flatMapCallback.body
        for (const frag of node.flatMapCallback.fragments) {
          const renderedIr = recurseInLoop(frag.ir)
          body = body.replace(frag.placeholder, `\`${renderedIr}\``)
        }
        body = applyPropsRewrite(body, propsObjectName ?? null)
        mapExpr = `\${${iterArrayExpr}.flatMap(${node.flatMapCallback.params} => ${body}).join('')}`
      } else if (node.mapPreamble) {
        const rawPreamble = node.templateMapPreamble ?? node.mapPreamble
        const preamble = applyPropsRewrite(rawPreamble, propsObjectName ?? null)
        mapExpr = `\${${iterArrayExpr}.${iterMethod}(${callbackParam} => { ${preamble} return \`${childTemplate}\` }).join('')}`
      } else {
        mapExpr = `\${${iterArrayExpr}.${iterMethod}(${callbackParam} => \`${childTemplate}\`).join('')}`
      }
      return `<!--${loopStartMarker(node.markerId)}-->${mapExpr}<!--${loopEndMarker(node.markerId)}-->`
    }

    case 'if-statement': {
      const consequent = recurse(node.consequent)
      const alternate = node.alternate ? recurse(node.alternate) : ''
      return `\${${transformExpr(node.condition, node.templateCondition)} ? \`${consequent}\` : \`${alternate}\`}`
    }

    case 'provider':
    case 'async':
      return node.children.map(recurse).join('')

    case 'slot':
      return ''

    default:
      return assertNever(node)
  }
}

/**
 * Check if an expression is a simple prop-based expression.
 * Simple prop expressions access props only: todo.done, todo.text, props.name
 * Non-prop expressions call signals: todos(), todos().length, todos().filter(...)
 */
export function isSimplePropExpression(expr: string, propNames: Set<string>): boolean {
  const match = expr.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/)
  if (!match) {
    // No identifier at start (e.g., template literal `${...}`) — check for signal calls
    return !expr.includes('()')
  }

  const rootIdent = match[1]
  if (propNames.has(rootIdent)) {
    // Even if root is a prop name, calling it as a function means it's a signal getter
    const rest = expr.slice(rootIdent.length)
    if (rest.startsWith('(')) return false
    return true
  }
  if (expr.includes('()')) return false

  return true
}
