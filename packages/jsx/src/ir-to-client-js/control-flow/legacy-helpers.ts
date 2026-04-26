/**
 * Stringify-layer helpers for control-flow emission.
 *
 * These functions all produce source lines directly (the older "string-push"
 * style) and are called from both:
 *   - `ir-to-client-js/control-flow.ts` (the public entry points)
 *   - `control-flow/stringify/*` (the Plan stringifiers, where the
 *     mode-dependent SSR/CSR shape and recursive branch/cond/inner-loop
 *     structure still lives without a dedicated Plan layer)
 *
 * They were previously colocated with the entry points in the legacy
 * `emit-control-flow.ts`. The split clarifies the dependency direction:
 *
 *   control-flow.ts -> control-flow/{plan,stringify}/* -> legacy-helpers.ts
 *
 * Each Plan-and-stringifier pair migration shrinks this file. The pure
 * utility helpers at the top (loopKeyFn, destructureLoopParam,
 * buildComponentPropsExpr, buildCompSelector, isTextOnlyConditional,
 * buildDepthLevels, DepthLevel) are stable and shared.
 */

import type { BranchLoop, LoopChildEvent, TopLevelLoop, NestedLoop, CollectedLoop } from '../types'
import type { IRLoopChildComponent, LoopParamBinding } from '../../types'
import { varSlotId, quotePropName, wrapLoopParamAsAccessor, exprReferencesIdent } from '../utils'
import { irChildrenToJsExpr } from '../html-template'
import { buildBranchCompositePlan } from './plan/build-composite-loop'
import { stringifyCompositeLoop } from './stringify/composite-loop'
import { buildReactiveEffectsPlan } from './plan/build-reactive-effects'
import { stringifyReactiveEffects } from './stringify/reactive-effects'
import {
  buildBranchLoopDelegationPlan,
} from './plan/build-event-delegation'
import { stringifyEventDelegation } from './stringify/event-delegation'
import { emitListenerBlock } from './stringify/event-listener'

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
 * Emit branch-scoped loop reconciliation. Extracted so the new Plan-based
 * stringifier can reuse it verbatim while we incrementally migrate insert()
 * shapes to Plan IR (PR 1) and only later move loops onto Plan (PR 2).
 *
 * The container lookup, mapArray dispatch, and reactive-effect wiring are
 * the same lines previously inlined in `emitBranchBindings`.
 */
export function emitBranchLoopBody(lines: string[], branchLoops: readonly BranchLoop[]): void {
  for (const loop of branchLoops) {
    const cv = varSlotId(loop.containerSlotId)
    lines.push(`      const [__loop_${cv}] = $(__branchScope, '${loop.containerSlotId}')`)

    if (loop.useElementReconciliation && (loop.nestedComponents?.length || loop.innerLoops?.length)) {
      // Composite loop: items contain child components OR inner loops that
      // require their own mapArray reconciliation — use the composite
      // renderItem path (createComponent for nested components, emitInnerLoopSetup
      // for inner loops).
      stringifyCompositeLoop(lines, buildBranchCompositePlan(loop, cv))
    } else {
      const keyFn = loopKeyFn(loop)
      const indexParam = loop.index || '__idx'
      const hasReactiveEffects = (loop.childReactiveAttrs?.length ?? 0) > 0
        || (loop.childReactiveTexts?.length ?? 0) > 0
        || (loop.childConditionals?.length ?? 0) > 0

      const { head: pHead, unwrap: pUnwrap } = destructureLoopParam(loop.param, loop.paramBindings)
      const unwrapInline = pUnwrap ? `${pUnwrap} ` : ''

      // Wrap the mapArray() call in a disposable effect so the inner
      // createEffect created by mapArray is registered as a child of this
      // disposable owner — branch swap then dispose()s the entry, releasing
      // both the effect and its dependency subscriptions. Without the wrap
      // the inner effect leaks: a hidden branch keeps re-rendering items
      // whenever its signals change (observation O-2).
      lines.push(`      __disposers.push(createDisposableEffect(() => {`)
      if (!hasReactiveEffects) {
        // Simple case: no reactive effects — return existing DOM as-is.
        // Template expressions use loopParam() to read the current item, so the
        // signal accessor stays intact without any unwrap.
        if (loop.mapPreamble) {
          lines.push(`        if (__loop_${cv}) mapArray(() => ${loop.array}, __loop_${cv}, ${keyFn}, (${pHead}, ${indexParam}, __existing) => { ${unwrapInline}if (__existing) return __existing; ${loop.mapPreamble}; const __tpl = document.createElement('template'); __tpl.innerHTML = \`${loop.template}\`; return __tpl.content.firstElementChild.cloneNode(true) })`)
        } else {
          lines.push(`        if (__loop_${cv}) mapArray(() => ${loop.array}, __loop_${cv}, ${keyFn}, (${pHead}, ${indexParam}, __existing) => { ${unwrapInline}if (__existing) return __existing; const __tpl = document.createElement('template'); __tpl.innerHTML = \`${loop.template}\`; return __tpl.content.firstElementChild.cloneNode(true) })`)
        }
      } else {
        // Multi-line renderItem with fine-grained effects — applies to both
        // SSR (existing DOM) and CSR (freshly created) paths so reactive reads
        // of non-item signals propagate to existing items too.
        lines.push(`        if (__loop_${cv}) mapArray(() => ${loop.array}, __loop_${cv}, ${keyFn}, (${pHead}, ${indexParam}, __existing) => {`)
        if (pUnwrap) {
          lines.push(`          ${pUnwrap}`)
        }
        if (loop.mapPreamble) {
          lines.push(`          ${loop.mapPreamble}`)
        }
        lines.push(`          const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = \`${loop.template}\`; return __tpl.content.firstElementChild.cloneNode(true) })()`)
        const branchReactivePlan = buildReactiveEffectsPlan({
          attrs: loop.childReactiveAttrs ?? [],
          texts: loop.childReactiveTexts ?? [],
          conditionals: loop.childConditionals,
          loopParam: loop.param,
          loopParamBindings: loop.paramBindings,
        })
        stringifyReactiveEffects(lines, branchReactivePlan, { indent: '          ', elVar: '__el' })
        lines.push(`          return __el`)
        lines.push(`        })`)
      }
      lines.push(`      }))`)
      emitBranchLoopEventDelegation(lines, loop, cv)
    }
  }
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

/**
 * Emit event delegation for simple (non-composite) loops inside conditional branches (#766).
 * Mirrors emitDynamicLoopEventDelegation but uses branch-scoped container variable.
 */
function emitBranchLoopEventDelegation(lines: string[], loop: BranchLoop, cv: string): void {
  stringifyEventDelegation(lines, buildBranchLoopDelegationPlan(loop, cv))
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
    const upsertCall = `upsertChild(${elVar}, '${comp.name}', ${slotIdLit}, ${propsExpr}${keyArg})`

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

