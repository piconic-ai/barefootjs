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

import type { LoopChildEvent, TopLevelLoop, NestedLoop, CollectedLoop } from '../types'
import type { IRLoopChildComponent, LoopParamBinding } from '../../types'
import { quotePropName, wrapLoopParamAsAccessor, exprReferencesIdent } from '../utils'
import { irChildrenToJsExpr } from '../html-template'
import { emitListenerBlock } from './stringify/event-listener'
import { nameForRegistryRef } from '../component-scope'

/**
 * Build the `keyFn` argument for mapArray / reconcileElements. `null` when
 * the loop has no key expression. Narrowing on `loop.kind` keeps `index`
 * off `NestedLoop` (nested loops never thread an explicit index parameter)
 * and lets the compiler verify we handled every flavour exhaustively.
 */
export function loopKeyFn(loop: CollectedLoop): string {
  if (loop.key === null) return 'null'
  const params = loop.kind === 'nested'
    ? loop.param
    : `${loop.param}${loop.index ? `, ${loop.index}` : ''}`
  return `(${params}) => String(${loop.key})`
}

/**
 * Return true when `expr` references the loop's param — either the simple
 * identifier itself, or any of its destructured binding names (#951). The
 * pattern text (e.g. `[, cfg]`) never word-matches on a bare name, so the
 * simple `exprReferencesIdent(expr, elem.param)` check misses destructured
 * callbacks without this widening.
 */
function exprRefsLoopBinding(expr: string, loop: { param: string; paramBindings?: readonly LoopParamBinding[] }): boolean {
  if (loop.paramBindings && loop.paramBindings.length > 0) {
    for (const b of loop.paramBindings) {
      if (exprReferencesIdent(expr, b.name)) return true
    }
    return false
  }
  return exprReferencesIdent(expr, loop.param)
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
  comp: { props: Array<{ name: string; value: string; isEventHandler: boolean; isLiteral: boolean }>, children?: import('../../types').IRNode[] },
  loopParam?: string,
  loopParamBindings?: readonly LoopParamBinding[],
): string {
  const wrap = loopParam ? (expr: string) => wrapLoopParamAsAccessor(expr, loopParam, loopParamBindings) : (expr: string) => expr
  const entries = comp.props.map((p) => {
    if (p.isEventHandler) {
      return `${quotePropName(p.name)}: ${wrap(p.value)}`
    } else if (p.isLiteral) {
      // Literal string values must NOT be wrapped — they don't reference loop params
      return `get ${quotePropName(p.name)}() { return ${JSON.stringify(p.value)} }`
    } else {
      return `get ${quotePropName(p.name)}() { return ${wrap(p.value)} }`
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
function emitEventSetup(ls: string[], indent: string, elVar: string, ev: LoopChildEvent, loopParam?: string, loopParamBindings?: readonly LoopParamBinding[]): void {
  const handler = loopParam ? wrapLoopParamAsAccessor(ev.handler, loopParam, loopParamBindings) : ev.handler
  emitListenerBlock(ls, indent, elVar, ev.childSlotId, '__e', ev.eventName, handler)
}

/** Build the component-finder CSS selector for SSR hydration initChild. */
export function buildCompSelector(comp: { slotId?: string | null; name: string }): string {
  // When slotId is available, use suffix-only selector. It is unique within
  // the parent scope and avoids matching siblings of the same component type
  // (e.g. two Buttons with different slotIds).
  return comp.slotId
    ? `[bf-s$="_${comp.slotId}"]`
    : `[bf-s^="~${comp.name}_"], [bf-s^="${comp.name}_"]`
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
): void {
  const wrap = loopParam ? (expr: string) => wrapLoopParamAsAccessor(expr, loopParam, loopParamBindings) : (expr: string) => expr
  for (const comp of comps) {
    const propsExpr = buildComponentPropsExpr(comp, loopParam, loopParamBindings)
    // Check if children are text-equivalent and reference the loop param — if so,
    // emit a createEffect to reactively update textContent when the signal changes.
    // Text-equivalent: expression, text, or conditional with text-only branches.
    const isTextOnly = comp.children?.length
      ? comp.children.every(c => c.type === 'expression' || c.type === 'text' || isTextOnlyConditional(c))
      : false
    const rawChildrenExpr = isTextOnly ? irChildrenToJsExpr(comp.children!) : null
    const childrenRefsLoop = loopParam != null && rawChildrenExpr != null
      && exprRefsLoopBinding(rawChildrenExpr, { param: loopParam, paramBindings: loopParamBindings })

    const slotIdLit = comp.slotId ? `'${comp.slotId}'` : 'null'
    const keyProp = comp.props.find(p => p.name === 'key')
    const keyArg = keyProp ? `, ${wrap(keyProp.value)}` : ''
    const upsertCall = `upsertChild(${elVar}, '${nameForRegistryRef(comp.name)}', ${slotIdLit}, ${propsExpr}${keyArg})`

    if (childrenRefsLoop) {
      const wrappedChildren = wrap(rawChildrenExpr!)
      ls.push(`${indent}{ const __c = ${upsertCall}; if (__c) { createEffect(() => { const __v = ${wrappedChildren}; __c.textContent = Array.isArray(__v) ? __v.join('') : String(__v ?? '') }) } }`)
    } else {
      ls.push(`${indent}${upsertCall}`)
    }
  }
  for (const ev of events) {
    emitEventSetup(ls, indent, elVar, ev, loopParam, loopParamBindings)
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

