/**
 * Shared utilities for control-flow emission.
 *
 * Every recursive emit-style helper that used to live here has been
 * Plan-ified — see `plan/` for the data carriers and `stringify/` for the
 * deterministic walks. What remains is a small set of stable utilities
 * shared across builders and one `emitComponentAndEventSetup` emitter that
 * builders feed already-wrapped IR data through.
 *
 * The dependency direction is one-way:
 *
 *   control-flow.ts -> control-flow/{plan,stringify}/* -> shared.ts
 */

import type { LoopChildEvent, LoopChildRef, TopLevelLoop, NestedLoop, CollectedLoop } from '../types.ts'
import type { IRLoopChildComponent, LoopParamBinding } from '../../types.ts'
import { quotePropName, wrapLoopParamAsAccessor, irChildrenFreeIds, attrValueToString } from '../utils.ts'
import { irChildrenToJsExpr } from '../html-template.ts'
import { emitListenerBlock } from './stringify/event-listener.ts'
import { nameForRegistryRef } from '../component-scope.ts'
import { BF_SCOPE, BF_HOST, BF_AT } from '@barefootjs/shared'
import type { LoopChildRefBinding } from './plan/loop.ts'
import {
  extractFreeIdentifiersFromText,
  extractFreeIdentifiersFromStatementText,
  extractFreeIdentifiersFromTemplateText,
} from '../csr-substitute.ts'

/**
 * Build the `keyFn` argument for mapArray / reconcileElements. `null` when
 * the loop has no key expression. Every `CollectedLoop` variant (top-level /
 * branch / nested) carries an `index: string | null` field (#2218 threaded
 * it onto `NestedLoop` too), so the index param — when present — is always
 * appended to the keyFn's own parameter list. mapArray invokes `keyFn(item,
 * i)` directly with the numeric index, independent of the synthetic
 * `__innerIdx<uid>` binding used inside a nested loop's renderItem body
 * (see `nestedLoopReferencesIndex` below), so no aliasing is needed here.
 */
export function loopKeyFn(loop: CollectedLoop): string {
  if (loop.key === null) return 'null'
  const params = `${loop.param}${loop.index ? `, ${loop.index}` : ''}`
  return `(${params}) => String(${loop.key})`
}

/**
 * Does a nested inner loop's body reference its own declared index
 * parameter (e.g. `i` from `.map((item, i) => ...)`)? Scans every surface
 * the renderItem/forEach body can read the index from — the key
 * expression, reactive text/attr expressions, the map-preamble statements,
 * the per-item HTML template's `${...}` interpolations, per-item events,
 * ref callbacks, and child-component props — so the byte-stable gate only
 * fires when the index is truly used (mirrors #2189's handler-only gate
 * for delegated events, `indexBindingLine` in `stringify/event-delegation.ts`).
 *
 * `comps` / `events` are passed separately (rather than read off `inner`)
 * because callers hold them in different shapes at different points in the
 * build pipeline — `DepthLevel.comps`/`.events` for the plain inner-loop
 * path, `inner.childComponents`/`inner.bindings.events` for the loop-child-
 * arm (conditional-branch) path.
 *
 * AST-based throughout (never regex) per repo convention — a token-level
 * scan would false-match a property access like `item.i` as a reference to
 * an index param named `i`.
 */
export function nestedLoopReferencesIndex(
  inner: NestedLoop,
  comps: readonly IRLoopChildComponent[],
  events: readonly LoopChildEvent[],
): boolean {
  const index = inner.index
  if (!index) return false

  const exprRefs = (text: string | null | undefined, precomputed?: ReadonlySet<string>): boolean => {
    if (precomputed) return precomputed.has(index)
    if (!text) return false
    return extractFreeIdentifiersFromText(text).has(index)
  }

  if (exprRefs(inner.key)) return true
  for (const t of inner.bindings.reactiveTexts) {
    if (exprRefs(t.expression, t.freeIdentifiers)) return true
  }
  for (const a of inner.bindings.reactiveAttrs) {
    if (exprRefs(a.expression, a.freeIdentifiers)) return true
  }
  if (inner.mapPreamble && extractFreeIdentifiersFromStatementText(inner.mapPreamble).has(index)) return true
  if (inner.template && extractFreeIdentifiersFromTemplateText(inner.template).has(index)) return true
  for (const ev of events) {
    if (exprRefs(ev.handler)) return true
  }
  for (const r of inner.bindings.refs) {
    if (exprRefs(r.callback)) return true
  }
  for (const c of comps) {
    for (const p of c.props) {
      if (exprRefs(attrValueToString(p.value))) return true
    }
    if (c.children?.length) {
      const childrenExpr = irChildrenToJsExpr(c.children)
      if (childrenExpr && exprRefs(childrenExpr)) return true
    }
  }
  return false
}

/**
 * Build the prelude alias statement that binds a nested inner loop's index
 * param to the synthetic numeric-index value mapArray/forEach passes into
 * renderItem (#2218), or `null` when no alias is needed. Gated by
 * `nestedLoopReferencesIndex` for byte-for-byte stability — loops that
 * declare an index but never read it emit no extra line. `paramHead` guards
 * against the (JS-illegal, can't actually happen) case where the index name
 * collides with the loop's own emitted item-parameter identifier — mirrors
 * the self-alias guard in #2189's `indexBindingLine`.
 *
 * `syntheticIndexVar` is the already-formatted variable name the caller's
 * stringifier binds the numeric index to (`__innerIdx<uid>` in
 * `stringify/inner-loop.ts`, `__bidx<uid>` in `stringify/loop-child-arm.ts`)
 * — passed in rather than assembled here so this helper doesn't need to
 * know which emission family is calling it.
 */
export function nestedLoopIndexAlias(
  inner: NestedLoop,
  syntheticIndexVar: string,
  paramHead: string,
  comps: readonly IRLoopChildComponent[],
  events: readonly LoopChildEvent[],
): string | null {
  const index = inner.index
  if (!index || index === paramHead) return null
  if (!nestedLoopReferencesIndex(inner, comps, events)) return null
  return `const ${index} = ${syntheticIndexVar}`
}

/**
 * Wrap each ref's `callback` expression with the loop-param accessor and
 * return `LoopChildRefBinding[]` ready for the stringifier. For dynamic
 * (`mapArray`-driven) loop variants where the per-item callback receives
 * the param as a signal accessor (`item: () => T`). Static loops should
 * use `buildStaticChildRefBindings` instead — their `forEach` callback
 * receives the raw item value, so wrapping would rewrite `item.x` to
 * `item().x` and throw at runtime (#1244).
 */
export function buildChildRefBindings(
  refs: readonly LoopChildRef[],
  loopParam: string,
  loopParamBindings: readonly LoopParamBinding[] | undefined,
): readonly LoopChildRefBinding[] {
  if (refs.length === 0) return []
  return refs.map(r => ({
    childSlotId: r.childSlotId,
    callback: wrapLoopParamAsAccessor(r.callback, loopParam, loopParamBindings),
  }))
}

/**
 * Pass-through `LoopChildRefBinding[]` builder for static-loop emit paths
 * where the param is bound as the raw item value (`forEach((param, idx) =>
 * ...)`). Refs go through unwrapped, mirroring how `reactiveTexts` and
 * `reactiveAttrs` are already handled on the static path. Wrapping with
 * `wrapLoopParamAsAccessor` would rewrite bare param references to
 * `param()` and throw `TypeError` at runtime when a ref callback closes
 * over the loop param (#1244, addressing PR #1352 Copilot review).
 */
export function buildStaticChildRefBindings(
  refs: readonly LoopChildRef[],
): readonly LoopChildRefBinding[] {
  if (refs.length === 0) return []
  return refs.map(r => ({
    childSlotId: r.childSlotId,
    callback: r.callback,
  }))
}

/**
 * Return true when an expression's free identifiers contain the loop's
 * param — either the simple identifier itself, or any of its destructured
 * binding names (#951). The pattern text (e.g. `[, cfg]`) never word-
 * matches on a bare name, so we widen the check across `paramBindings`.
 *
 * Consumes a pre-computed `Set<string>` of free identifiers (#1267)
 * rather than running word-boundary regex on the expression text — this
 * avoids over-match against string literals and member-access tails.
 */
function exprRefsLoopBinding(freeIds: ReadonlySet<string>, loop: { param: string; paramBindings?: readonly LoopParamBinding[] }): boolean {
  if (loop.paramBindings && loop.paramBindings.length > 0) {
    for (const b of loop.paramBindings) {
      if (freeIds.has(b.name)) return true
    }
    return false
  }
  return freeIds.has(loop.param)
}

/**
 * Compute the mapArray renderItem parameter head and any unwrap statement
 * needed when the map callback destructures its item parameter.
 *
 * mapArray passes the item to renderItem as a signal accessor (function).
 * Interpolating `[a, b]` or `{ x, y }` verbatim into the arrow head crashes
 * at hydration with "function is not iterable" (#949). We rename the param
 * to a synthetic accessor name and — for patterns the IR rewriter can't
 * fully express as per-binding accessor paths — unwrap once at body entry.
 *
 * The `__bf_` prefix is a barefoot-reserved namespace — avoids any chance
 * of collision if the user writes `.map(item => ...)` with a matching name.
 *
 * Detection relies on `param` being the trimmed output of
 * `firstParam.name.getText()` in `jsx-to-ir.ts::transformMapCall` — no
 * leading parens, no type annotations, no trivia whitespace. If that
 * upstream contract changes, the prefix check must be widened in lockstep
 * or the #949 crash resurfaces silently.
 *
 * Option 3 path (#951): when `paramBindings` is supplied, every
 * destructured reference has already been rewritten to `__bfItem().path`
 * in template strings, event handlers, reactive attrs, and preambles. No
 * body-entry unwrap is emitted — the destructured locals simply don't
 * exist in the generated code, so same-key `setItem` updates read the
 * live accessor and refresh the DOM. When `paramBindings` is missing
 * (rest element, computed property key — see `BF025`), we fall back to
 * the original unwrap so the captured-semantics path still compiles.
 */
export function destructureLoopParam(
  param: string,
  paramBindings?: readonly LoopParamBinding[],
): { head: string; unwrap: string } {
  if (param.startsWith('[') || param.startsWith('{')) {
    if (paramBindings && paramBindings.length > 0) {
      return { head: '__bfItem', unwrap: '' }
    }
    return {
      head: '__bfItem',
      unwrap: `const ${param} = __bfItem();`,
    }
  }
  return { head: param, unwrap: '' }
}

/**
 * Build a props object expression string from component prop definitions.
 * Shared by emitComponentLoopReconciliation and emitCompositeElementReconciliation.
 */
export function buildComponentPropsExpr(
  comp: { props: Array<{ name: string; value: import('../../types.ts').AttrValue; isEventHandler: boolean }>, children?: import('../../types.ts').IRNode[] },
  loopParam?: string,
  loopParamBindings?: readonly LoopParamBinding[],
): string {
  const wrap = loopParam ? (expr: string) => wrapLoopParamAsAccessor(expr, loopParam, loopParamBindings) : (expr: string) => expr
  const entries = comp.props.map((p) => {
    if (p.isEventHandler) {
      const handlerExpr = attrValueToString(p.value) ?? 'undefined'
      return `${quotePropName(p.name)}: ${wrap(handlerExpr)}`
    }
    switch (p.value.kind) {
      case 'literal':
        // Literal string values must NOT be wrapped — they don't reference loop params
        return `get ${quotePropName(p.name)}() { return ${JSON.stringify(p.value.value)} }`
      case 'boolean-shorthand':
      case 'boolean-attr':
        return `get ${quotePropName(p.name)}() { return true }`
      case 'jsx-children': {
        const childExpr = irChildrenToJsExpr(p.value.children)
        return `get ${quotePropName(p.name)}() { return ${wrap(childExpr)} }`
      }
      case 'expression':
      case 'template':
      case 'spread': {
        const valueExpr = attrValueToString(p.value)!
        return `get ${quotePropName(p.name)}() { return ${wrap(valueExpr)} }`
      }
    }
  })
  if ('children' in comp && Array.isArray(comp.children) && comp.children.length > 0) {
    const childrenExpr = irChildrenToJsExpr(comp.children)
    if (childrenExpr && childrenExpr !== "''") {
      entries.push(`get children() { return ${wrap(childrenExpr)} }`)
    }
  }
  return entries.length > 0 ? `{ ${entries.join(', ')} }` : '{}'
}

/** Per-inner-loop data for composite loop emission. */
export interface DepthLevel {
  comps: (TopLevelLoop['nestedComponents'] & {})[number][]
  events: LoopChildEvent[]
  loopInfo: NestedLoop | null
}

/**
 * Build per-inner-loop grouping of components and events.
 * One DepthLevel entry per inner loop (not per depth), so sibling loops at the
 * same depth (e.g., reactions.map + replies.map) each get their own forEach block.
 */
export function buildDepthLevels(
  innerLoops: NestedLoop[],
  nestedComps: IRLoopChildComponent[],
  childEvents: LoopChildEvent[],
): DepthLevel[] {
  return innerLoops.map(loop => ({
    // Exclude components that sit inside a conditional branch of the loop
    // body. Those are handled by the conditional's `insert()` bindEvents
    // and must not be re-initialized here, otherwise `initChild` runs twice
    // and double-wires event handlers (#929).
    comps: nestedComps.filter(c =>
      (c.loopDepth ?? 0) === loop.depth
      && c.innerLoopArray === loop.array
      && !c.insideConditional
    ),
    events: childEvents.filter(ev => {
      if (ev.nestedLoops.length === 0) return false
      const innermost = ev.nestedLoops[ev.nestedLoops.length - 1]
      return innermost.depth === loop.depth && innermost.array === loop.array
    }),
    loopInfo: loop,
  }))
}

/** Emit a single addEventListener call for a child event on a given element. */
function emitEventSetup(
  ls: string[],
  indent: string,
  elVar: string,
  ev: LoopChildEvent,
  loopParam?: string,
  loopParamBindings?: readonly LoopParamBinding[],
  bodyIsMultiRoot: boolean = false,
): void {
  const handler = loopParam ? wrapLoopParamAsAccessor(ev.handler, loopParam, loopParamBindings) : ev.handler
  emitListenerBlock(ls, indent, elVar, ev.childSlotId, '__e', ev.eventName, handler, 'dom', bodyIsMultiRoot)
}

/**
 * Build the slot-child selector embedded verbatim into generated code,
 * e.g. `qsa(__el, ${buildCompSelector(c)})`.
 *
 * - With `slotId`: primary `(bf-h, bf-m)` against the enclosing scope's
 *   `__scopeId`, with a `[bf-s$="_<slot>"]` fallback for `renderChild`
 *   paths that stamp only the parent-anchored bf-s. See `spec/compiler.md`
 *   "Slot identity".
 * - Without `slotId`: `bf-s^="<Name>_"` name-prefix for top-level lookup.
 */
export function buildCompSelector(comp: { slotId?: string | null; name: string }): string {
  return comp.slotId
    ? `\`[${BF_HOST}="\${__scopeId}"][${BF_AT}="${comp.slotId}"], [${BF_SCOPE}$="_${comp.slotId}"]\``
    : `'[${BF_SCOPE}^="${comp.name}_"]'`
}

/**
 * Emit component replacement + event setup for a list of components and events.
 * Used for both outer-level and inner-level items in renderItem body.
 *
 * For new elements (CSR): replaces placeholders with createComponent.
 * For SSR elements (hydration): finds scope elements and calls initChild.
 */
/** Check if an IR node is a conditional whose branches are text/expression only. */
export function isTextOnlyConditional(node: { type: string; [k: string]: any }): boolean {
  if (node.type !== 'conditional') return false
  const checkNode = (n: { type: string; [k: string]: any }): boolean =>
    n.type === 'text' || n.type === 'expression' || (n.type === 'conditional' && isTextOnlyConditional(n))
  return checkNode(node.whenTrue) && checkNode(node.whenFalse)
}

/**
 * Emit child component initialisation + event listener setup for a list of
 * components and events on `elVar`. Mode-independent: each comp emits a
 * single `upsertChild(...)` runtime call that resolves SSR (initialise
 * existing scope) vs CSR (replace placeholder + createComponent) at runtime.
 *
 * Pre-O-1-mode-removal this function took a `mode: 'csr' | 'ssr'` argument
 * and the caller emitted both branches inside an `if (!__existing) ... else
 * ...` block. The branches are now collapsed into one call site.
 */
export function emitComponentAndEventSetup(
  ls: string[],
  indent: string,
  elVar: string,
  comps: TopLevelLoop['nestedComponents'] & {},
  events: LoopChildEvent[],
  loopParam?: string,
  loopParamBindings?: readonly LoopParamBinding[],
  bodyIsMultiRoot: boolean = false,
): void {
  const wrap = loopParam ? (expr: string) => wrapLoopParamAsAccessor(expr, loopParam, loopParamBindings) : (expr: string) => expr
  // Multi-root loop bodies (#1212) must search the item's sibling roots
  // and the pre-insertion `__bfExtras` stash; `upsertChildItem` wraps the
  // single-root `upsertChild` semantics in that walk.
  const upsertFn = bodyIsMultiRoot ? 'upsertChildItem' : 'upsertChild'
  for (const comp of comps) {
    const propsExpr = buildComponentPropsExpr(comp, loopParam, loopParamBindings)
    // Check if children are text-equivalent and reference the loop param — if so,
    // emit a createEffect to reactively update textContent when the signal changes.
    // Text-equivalent: expression, text, or conditional with text-only branches.
    const isTextOnly = comp.children?.length
      ? comp.children.every(c => c.type === 'expression' || c.type === 'text' || isTextOnlyConditional(c))
      : false
    const rawChildrenExpr = isTextOnly ? irChildrenToJsExpr(comp.children!) : null
    const childrenFreeIds = isTextOnly && comp.children ? irChildrenFreeIds(comp.children) : undefined
    const childrenRefsLoop = loopParam != null && rawChildrenExpr != null && childrenFreeIds != null
      && exprRefsLoopBinding(childrenFreeIds, { param: loopParam, paramBindings: loopParamBindings })

    const slotIdLit = comp.slotId ? `'${comp.slotId}'` : 'null'
    const keyProp = comp.props.find(p => p.name === 'key')
    const keyArg = keyProp ? `, ${wrap(attrValueToString(keyProp.value) ?? 'undefined')}` : ', undefined'
    // Pass the surrounding component's __scope so upsertChild can derive
    // bf-h / bf-m even when the loop-item element (`elVar`) is a
    // freshly-created detached fragment. Without this anchor, the new
    // CSR-mounted child wouldn't carry slot-relationship markers and any
    // future upsertChild lookup against it would fail.
    const upsertCall = `${upsertFn}(${elVar}, '${nameForRegistryRef(comp.name)}', ${slotIdLit}, ${propsExpr}${keyArg}, __scope)`

    if (childrenRefsLoop) {
      const wrappedChildren = wrap(rawChildrenExpr!)
      ls.push(`${indent}{ const __c = ${upsertCall}; if (__c) { createEffect(() => { const __v = ${wrappedChildren}; __c.textContent = Array.isArray(__v) ? __v.join('') : String(__v ?? '') }) } }`)
    } else {
      ls.push(`${indent}${upsertCall}`)
    }
  }
  for (const ev of events) {
    emitEventSetup(ls, indent, elVar, ev, loopParam, loopParamBindings, bodyIsMultiRoot)
  }
}

/**
 * Emit the unified renderItem function body for composite loops.
 * Handles both CSR (create from template) and SSR (initialize existing element).
 * Inner loops, events, and reactive effects are shared between both paths.
 */
// emitCompositeRenderItemBody — replaced by stringifyCompositeLoop.
// The conditional-slot filter (excluding components inside reactive
// conditional branches) is now applied in the Plan builder
// (`build-composite-loop.ts::filterCondCompsOut`).

