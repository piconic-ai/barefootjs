/**
 * Control flow emission: conditionals and loops.
 * Handles insert() for reactive conditionals, reconcileElements for dynamic loops,
 * and event delegation within loop containers.
 */

import type { ClientJsContext, BranchLoop, LoopChildEvent, LoopChildConditional, TopLevelLoop, NestedLoop, CollectedLoop } from './types'
import type { IRLoopChildComponent, LoopParamBinding } from '../types'
import { toDomEventName, wrapHandlerInBlock, varSlotId, quotePropName, DATA_BF_PH, keyAttrName, wrapLoopParamAsAccessor, exprReferencesIdent } from './utils'
import { addCondAttrToTemplate, irChildrenToJsExpr } from './html-template'
import { emitAttrUpdate } from './emit-reactive'
import { buildInsertPlan } from './control-flow/plan/build-insert'
import { stringifyInsert } from './control-flow/stringify/insert'
import { buildPlainLoopPlan, buildStaticLoopPlan } from './control-flow/plan/build-loop'
import { stringifyPlainLoop, stringifyStaticLoop } from './control-flow/stringify/loop'
import { buildComponentLoopPlan } from './control-flow/plan/build-component-loop'
import { stringifyComponentLoop } from './control-flow/stringify/component-loop'
import { buildTopLevelCompositePlan, buildBranchCompositePlan } from './control-flow/plan/build-composite-loop'
import { stringifyCompositeLoop } from './control-flow/stringify/composite-loop'
import {
  buildDynamicLoopDelegationPlan,
  buildBranchLoopDelegationPlan,
  buildStaticArrayDelegationPlan,
} from './control-flow/plan/build-event-delegation'
import { stringifyEventDelegation } from './control-flow/stringify/event-delegation'

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
      emitCompositeBranchLoop(lines, loop, cv)
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
        emitLoopChildReactiveEffects(
          lines,
          '          ',
          '__el',
          loop.childReactiveAttrs ?? [],
          loop.childReactiveTexts ?? [],
          loop.childConditionals,
          loop.param,
          loop.paramBindings,
        )
        lines.push(`          return __el`)
        lines.push(`        })`)
      }
      lines.push(`      }))`)
      emitBranchLoopEventDelegation(lines, loop, cv)
    }
  }
}

/**
 * Emit composite loop reconciliation inside a conditional branch's bindEvents.
 * Mirrors emitCompositeElementReconciliation but scoped to a branch with disposal.
 * Generates: SSR hydration (initChild) + CSR renderItem (createComponent) + reconcileElements.
 */
function emitCompositeBranchLoop(
  lines: string[],
  loop: BranchLoop,
  cv: string,
): void {
  stringifyCompositeLoop(lines, buildBranchCompositePlan(loop, cv))
}

/** Emit insert() calls for server-rendered reactive conditionals with branch configs. */
export function emitConditionalUpdates(lines: string[], ctx: ClientJsContext): void {
  for (const elem of ctx.conditionalElements) {
    const plan = buildInsertPlan(elem, { scope: { kind: 'top' }, eventNameMode: 'dom' })
    stringifyInsert(lines, plan, { leadingIndent: '  ', bodyIndent: '      ' })
    lines.push('')
  }
}

/** Emit insert() calls for client-only conditionals (not server-rendered). */
export function emitClientOnlyConditionals(lines: string[], ctx: ClientJsContext): void {
  for (const elem of ctx.clientOnlyConditionals) {
    const plan = buildInsertPlan(elem, { scope: { kind: 'top' }, eventNameMode: 'raw' })
    lines.push(`  // @client conditional: ${elem.slotId}`)
    stringifyInsert(lines, plan, { leadingIndent: '  ', bodyIndent: '      ' })
    lines.push('')
  }
}

/** Emit loop updates: dispatches to static or dynamic handlers per element. */
export function emitLoopUpdates(lines: string[], ctx: ClientJsContext): void {
  for (const elem of ctx.loopElements) {
    if (elem.isStaticArray) {
      emitStaticArrayUpdates(lines, elem)
    } else {
      emitDynamicLoopUpdates(lines, elem)
    }
  }
}

/**
 * Emit fine-grained createEffect calls for reactive attributes inside a loop
 * item's renderItem body. Each reactive attr gets its own effect so it updates
 * independently when the signal it reads changes.
 * Used by both plain element and composite element dynamic loops.
 */
/** Emit initChild calls for components inside a conditional branch. */
function emitBranchChildComponentInits(
  lines: string[],
  indent: string,
  components: Array<{ name: string; slotId: string | null; props: import('../types').IRProp[]; children?: import('../types').IRNode[] }>,
  loopParam?: string,
  wrapFn?: (expr: string) => string,
  loopParamBindings?: readonly LoopParamBinding[],
): void {
  const wrap = wrapFn ?? (loopParam ? (expr: string) => wrapLoopParamAsAccessor(expr, loopParam, loopParamBindings) : (expr: string) => expr)
  for (const comp of components) {
    // Use slotId suffix match only when available to avoid matching
    // siblings of the same component type (e.g. two Buttons with different slotIds).
    const selector = comp.slotId
      ? `[bf-s$="_${comp.slotId}"]`
      : `[bf-s^="~${comp.name}_"]`
    const propsEntries = comp.props
      .filter(p => p.name !== 'key')
      .map(p => {
        if (p.name.startsWith('on') && p.name.length > 2) return `${quotePropName(p.name)}: ${wrap(p.value)}`
        if (p.isLiteral) return `get ${quotePropName(p.name)}() { return ${JSON.stringify(p.value)} }`
        return `get ${quotePropName(p.name)}() { return ${wrap(p.value)} }`
      })
    // Include children for CSR createComponent (SSR initChild doesn't need it — text is in HTML)
    const childrenExpr = comp.children?.length ? irChildrenToJsExpr(comp.children) : null
    if (childrenExpr) {
      propsEntries.push(`get children() { return ${wrap(childrenExpr)} }`)
    }
    const propsExpr = propsEntries.length > 0 ? `{ ${propsEntries.join(', ')} }` : '{}'
    // SSR: element has bf-s attribute → initChild.
    // CSR: element is a placeholder (data-bf-ph) → createComponent to replace it.
    const phId = comp.slotId || comp.name
    lines.push(`${indent}{ let __c = qsa(__branchScope, '${selector}'); if (!__c) { const __ph = __branchScope.querySelector('[${DATA_BF_PH}="${phId}"]'); if (__ph) { __c = createComponent('${comp.name}', ${propsExpr}); __ph.replaceWith(__c) } } if (__c) initChild('${comp.name}', __c, ${propsExpr}) }`)
  }
}

/**
 * Emit mapArray calls for inner loops inside a conditional branch's bindEvents.
 * When a loop item has a conditional (e.g., showReplies ? replies : null),
 * the inner loop container only exists when the branch is active.
 * This sets up mapArray each time the branch activates.
 */
function emitBranchInnerLoops(
  lines: string[],
  indent: string,
  scopeVar: string,
  innerLoops: import('./types').NestedLoop[] | undefined,
  outerLoopParam?: string,
  outerWrapFn?: (expr: string) => string,
  outerLoopParamBindings?: readonly LoopParamBinding[],
): void {
  if (!innerLoops || !outerLoopParam) return
  const wrapOuter = outerWrapFn ?? ((expr: string) => wrapLoopParamAsAccessor(expr, outerLoopParam, outerLoopParamBindings))

  for (let i = 0; i < innerLoops.length; i++) {
    const inner = innerLoops[i]
    if (!inner.refsOuterParam || !inner.template) continue

    const uid = `br_${i}`
    const arrayExpr = wrapOuter(inner.array)
    const keyFn = loopKeyFn(inner)
    const wrapBoth = (expr: string) => wrapLoopParamAsAccessor(wrapOuter(expr), inner.param, inner.paramBindings)
    // Template is already wrapped at generation time (irToPlaceholderTemplate with loopParams)
    const wrappedTemplate = inner.template
    // Find the container for the inner loop. Try bf= attribute (plain elements) first,
    // then bf-s$ suffix match (component scope elements like SelectContent).
    const csl = inner.containerSlotId
    const containerExpr = csl
      ? `(${scopeVar}.querySelector('[bf="${csl}"]') ?? ${scopeVar}.querySelector('[bf-s$="_${csl}"]') ?? ${scopeVar})`
      : scopeVar

    const { head: innerHead, unwrap: innerUnwrap } = destructureLoopParam(inner.param, inner.paramBindings)

    lines.push(`${indent}{ const __bic${uid} = ${containerExpr}`)
    lines.push(`${indent}if (__bic${uid}) mapArray(() => ${arrayExpr} || [], __bic${uid}, ${keyFn}, (${innerHead}, __bidx${uid}, __existing) => {`)
    if (innerUnwrap) {
      lines.push(`${indent}  ${innerUnwrap}`)
    }
    lines.push(`${indent}  let __bel${uid} = __existing ?? (() => { const __t = document.createElement('template'); __t.innerHTML = \`${wrappedTemplate}\`; return __t.content.firstElementChild.cloneNode(true) })()`)
    if (inner.key) {
      const wrappedKey = wrapLoopParamAsAccessor(inner.key, inner.param, inner.paramBindings)
      lines.push(`${indent}  __bel${uid}.setAttribute('${keyAttrName(1)}', String(${wrappedKey}))`)
    }
    // Components and events inside inner loop items
    const wrapInner = (expr: string) => wrapLoopParamAsAccessor(expr, inner.param, inner.paramBindings)
    // Recursively wrap IR nodes for inner loop param accessor conversion
    const wrapIRNodeBranch = (node: any): any => {
      if (node.type === 'component') {
        return { ...node, props: node.props.map((p: any) => p.isLiteral ? p : ({ ...p, value: wrapInner(p.value) })), children: node.children?.map(wrapIRNodeBranch) }
      }
      if (node.type === 'expression' && node.expr) return { ...node, expr: wrapInner(node.expr) }
      if (node.children) return { ...node, children: node.children.map(wrapIRNodeBranch) }
      return node
    }
    const comps = (inner.childComponents ?? []).map(comp => ({
      ...comp,
      props: comp.props.map(p => p.isLiteral ? p : ({ ...p, value: wrapInner(p.value) })),
      children: comp.children?.map(wrapIRNodeBranch),
    }))
    const events = (inner.childEvents ?? []).map(ev => ({
      ...ev,
      handler: wrapInner(ev.handler),
    }))
    if (comps.length > 0 || events.length > 0) {
      lines.push(`${indent}  if (!__existing) {`)
      emitComponentAndEventSetup(lines, `${indent}    `, `__bel${uid}`, comps, events, 'csr', outerLoopParam, outerLoopParamBindings)
      lines.push(`${indent}  } else {`)
      emitComponentAndEventSetup(lines, `${indent}    `, `__bel${uid}`, comps, events, 'ssr', outerLoopParam, outerLoopParamBindings)
      lines.push(`${indent}  }`)
    }
    // Reactive text effects for inner loop items
    if (inner.childReactiveTexts && inner.childReactiveTexts.length > 0) {
      for (const text of inner.childReactiveTexts) {
        const wrappedExpr = wrapBoth(text.expression)
        if (text.insideConditional) {
          // Text is inside a conditional branch: insert() may replace the DOM element,
          // making a captured text node stale. Re-query $t inside the effect so each
          // update always finds the current live text node.
          lines.push(`${indent}  createEffect(() => { const [__rt] = $t(__bel${uid}, '${text.slotId}'); if (__rt) __rt.textContent = String(${wrappedExpr}) })`)
        } else {
          lines.push(`${indent}  { const [__rt] = $t(__bel${uid}, '${text.slotId}')`)
          lines.push(`${indent}  if (__rt) createEffect(() => { __rt.textContent = String(${wrappedExpr}) }) }`)
        }
      }
    }
    // Nested conditionals inside inner loop items (#830 Path B)
    if (inner.childConditionals && inner.childConditionals.length > 0) {
      emitNestedLoopChildConditionals(
        lines, `${indent}  `, `__bel${uid}`,
        inner.childConditionals,
        wrapBoth,
        inner.param,
      )
    }
    lines.push(`${indent}  return __bel${uid}`)
    lines.push(`${indent}}) }`)
  }
}

/**
 * Emit event bindings inside insert() bindEvents for a loop-child conditional branch.
 * Events must be bound after insert() resolves the branch, so the correct DOM element
 * is live (prevents stale-reference bug when insert() replaces SSR elements, #839).
 */
function emitLoopCondBranchEventBindings(
  lines: string[],
  indent: string,
  events: import('./types').ConditionalBranchEvent[] | undefined,
  wrap: (expr: string) => string,
): void {
  if (!events || events.length === 0) return
  const eventsBySlot = new Map<string, import('./types').ConditionalBranchEvent[]>()
  for (const ev of events) {
    if (!eventsBySlot.has(ev.slotId)) eventsBySlot.set(ev.slotId, [])
    eventsBySlot.get(ev.slotId)!.push(ev)
  }
  for (const [slotId, slotEvents] of eventsBySlot) {
    const v = varSlotId(slotId)
    // Use qsa() instead of $() because __branchScope is a loop item element
    // (without bf-s attr), and $() uses scope-aware search that would fail
    // to find descendants when the nearest bf-s is the component root.
    lines.push(`${indent}{ const _${v} = qsa(__branchScope, '[bf="${slotId}"]')`)
    for (const ev of slotEvents) {
      const handler = wrapHandlerInBlock(wrap(ev.handler))
      lines.push(`${indent}  if (_${v}) _${v}.addEventListener('${toDomEventName(ev.eventName)}', ${handler}) }`)
    }
  }
}

/**
 * Recursively emit insert() calls for nested conditionals inside loop items.
 * Handles Path A (conditional→conditional) and Path B (loop→conditional) by
 * mutual recursion with emitBranchInnerLoops (#830).
 */
function emitNestedLoopChildConditionals(
  lines: string[],
  indent: string,
  scopeVar: string,
  conditionals: LoopChildConditional[] | undefined,
  wrap: (expr: string) => string,
  loopParam?: string,
  loopParamBindings?: readonly LoopParamBinding[],
): void {
  if (!conditionals || conditionals.length === 0) return
  for (const cond of conditionals) {
    const whenTrueWithCond = addCondAttrToTemplate(wrap(cond.whenTrueHtml), cond.slotId)
    const whenFalseWithCond = addCondAttrToTemplate(wrap(cond.whenFalseHtml), cond.slotId)
    lines.push(`${indent}insert(${scopeVar}, '${cond.slotId}', () => ${wrap(cond.condition)}, {`)
    lines.push(`${indent}  template: () => \`${whenTrueWithCond}\`,`)
    lines.push(`${indent}  bindEvents: (__branchScope) => {`)
    emitLoopCondBranchEventBindings(lines, `${indent}    `, cond.whenTrue.events, wrap)
    emitBranchChildComponentInits(lines, `${indent}    `, cond.whenTrue.childComponents, loopParam, wrap, loopParamBindings)
    emitBranchInnerLoops(lines, `${indent}    `, '__branchScope', cond.whenTrue.innerLoops, loopParam, wrap, loopParamBindings)
    emitNestedLoopChildConditionals(lines, `${indent}    `, '__branchScope', cond.whenTrue.conditionals, wrap, loopParam, loopParamBindings)
    lines.push(`${indent}  }`)
    lines.push(`${indent}}, {`)
    lines.push(`${indent}  template: () => \`${whenFalseWithCond}\`,`)
    lines.push(`${indent}  bindEvents: (__branchScope) => {`)
    emitLoopCondBranchEventBindings(lines, `${indent}    `, cond.whenFalse.events, wrap)
    emitBranchChildComponentInits(lines, `${indent}    `, cond.whenFalse.childComponents, loopParam, wrap, loopParamBindings)
    emitBranchInnerLoops(lines, `${indent}    `, '__branchScope', cond.whenFalse.innerLoops, loopParam, wrap, loopParamBindings)
    emitNestedLoopChildConditionals(lines, `${indent}    `, '__branchScope', cond.whenFalse.conditionals, wrap, loopParam, loopParamBindings)
    lines.push(`${indent}  }`)
    lines.push(`${indent}})`)
  }
}

export function emitLoopChildReactiveEffects(
  lines: string[],
  indent: string,
  elVar: string,
  attrs: TopLevelLoop['childReactiveAttrs'],
  texts: TopLevelLoop['childReactiveTexts'],
  conditionals?: TopLevelLoop['childConditionals'],
  loopParam?: string,
  loopParamBindings?: readonly LoopParamBinding[],
): void {
  const wrap = loopParam ? (expr: string) => wrapLoopParamAsAccessor(expr, loopParam, loopParamBindings) : (expr: string) => expr
  // Reactive attribute effects
  const attrsBySlot = new Map<string, typeof attrs>()
  for (const attr of attrs) {
    if (!attrsBySlot.has(attr.childSlotId)) {
      attrsBySlot.set(attr.childSlotId, [])
    }
    attrsBySlot.get(attr.childSlotId)!.push(attr)
  }
  for (const [slotId, slotAttrs] of attrsBySlot) {
    const varName = `__ra_${varSlotId(slotId)}`
    lines.push(`${indent}{ const ${varName} = qsa(${elVar}, '[bf="${slotId}"]')`)
    lines.push(`${indent}if (${varName}) {`)
    for (const attr of slotAttrs) {
      lines.push(`${indent}  createEffect(() => {`)
      for (const stmt of emitAttrUpdate(varName, attr.attrName, wrap(attr.expression), attr)) {
        lines.push(`${indent}    ${stmt}`)
      }
      lines.push(`${indent}  })`)
    }
    lines.push(`${indent}} }`)
  }

  // Collect text slot IDs that are inside conditionals — these must be
  // emitted inside bindEvents, not outside, because insert() branch swaps
  // replace the DOM nodes that text effects reference.
  const textSlotsInConditionals = new Set<string>()
  if (conditionals) {
    for (const cond of conditionals) {
      for (const text of texts) {
        if (cond.whenTrueHtml.includes(`bf:${text.slotId}`) || cond.whenFalseHtml.includes(`bf:${text.slotId}`)) {
          textSlotsInConditionals.add(text.slotId)
        }
      }
    }
  }

  // Reactive text content effects (only for slots NOT inside conditionals)
  for (const text of texts) {
    if (textSlotsInConditionals.has(text.slotId)) continue
    const varName = `__rt_${varSlotId(text.slotId)}`
    lines.push(`${indent}{ const [${varName}] = $t(${elVar}, '${text.slotId}')`)
    lines.push(`${indent}if (${varName}) createEffect(() => { ${varName}.textContent = String(${wrap(text.expression)}) }) }`)
  }

  // Reactive conditional effects
  if (conditionals) {
    // Text effects scoped to each branch
    const textsForBranch = (html: string) =>
      texts.filter(t => textSlotsInConditionals.has(t.slotId) && html.includes(`bf:${t.slotId}`))

    for (const cond of conditionals) {
      const whenTrueWithCond = addCondAttrToTemplate(wrap(cond.whenTrueHtml), cond.slotId)
      const whenFalseWithCond = addCondAttrToTemplate(wrap(cond.whenFalseHtml), cond.slotId)
      lines.push(`${indent}insert(${elVar}, '${cond.slotId}', () => ${wrap(cond.condition)}, {`)
      lines.push(`${indent}  template: () => \`${whenTrueWithCond}\`,`)
      lines.push(`${indent}  bindEvents: (__branchScope) => {`)
      emitLoopCondBranchEventBindings(lines, `${indent}    `, cond.whenTrue.events, wrap)
      emitBranchChildComponentInits(lines, `${indent}    `, cond.whenTrue.childComponents, loopParam, undefined, loopParamBindings)
      emitBranchInnerLoops(lines, `${indent}    `, '__branchScope', cond.whenTrue.innerLoops, loopParam, undefined, loopParamBindings)
      emitNestedLoopChildConditionals(lines, `${indent}    `, '__branchScope', cond.whenTrue.conditionals, wrap, loopParam, loopParamBindings)
      for (const text of textsForBranch(cond.whenTrueHtml)) {
        const varName = `__rt_${varSlotId(text.slotId)}`
        lines.push(`${indent}    { const [${varName}] = $t(__branchScope, '${text.slotId}')`)
        lines.push(`${indent}    if (${varName}) createEffect(() => { ${varName}.textContent = String(${wrap(text.expression)}) }) }`)
      }
      lines.push(`${indent}  }`)
      lines.push(`${indent}}, {`)
      lines.push(`${indent}  template: () => \`${whenFalseWithCond}\`,`)
      lines.push(`${indent}  bindEvents: (__branchScope) => {`)
      emitLoopCondBranchEventBindings(lines, `${indent}    `, cond.whenFalse.events, wrap)
      emitBranchChildComponentInits(lines, `${indent}    `, cond.whenFalse.childComponents, loopParam, undefined, loopParamBindings)
      emitBranchInnerLoops(lines, `${indent}    `, '__branchScope', cond.whenFalse.innerLoops, loopParam, undefined, loopParamBindings)
      emitNestedLoopChildConditionals(lines, `${indent}    `, '__branchScope', cond.whenFalse.conditionals, wrap, loopParam, loopParamBindings)
      for (const text of textsForBranch(cond.whenFalseHtml)) {
        const varName = `__rt_${varSlotId(text.slotId)}`
        lines.push(`${indent}    { const [${varName}] = $t(__branchScope, '${text.slotId}')`)
        lines.push(`${indent}    if (${varName}) createEffect(() => { ${varName}.textContent = String(${wrap(text.expression)}) }) }`)
      }
      lines.push(`${indent}  }`)
      lines.push(`${indent}})`)
    }
  }
}

/**
 * Emit reactive attribute effects and event delegation for static arrays.
 * Static arrays are server-rendered once; only signal-dependent attributes
 * and event handlers need client-side setup.
 */
function emitStaticArrayUpdates(lines: string[], elem: TopLevelLoop): void {
  // Static array initChild calls are deferred to emitStaticArrayChildInits()
  // so that parent context providers (provideContext) run first.
  stringifyStaticLoop(lines, buildStaticLoopPlan(elem))

  // Event delegation for plain elements in static arrays (#537).
  // Static arrays have no data-key/bf-i markers, so walk up from target to
  // the container's direct child and use indexOf for index lookup.
  if (!elem.childComponent && elem.childEvents.length > 0) {
    stringifyEventDelegation(lines, buildStaticArrayDelegationPlan(elem))
  }
}

/**
 * Emit reconcileElements for a dynamic loop element.
 * Handles three sub-cases:
 *   - Composite (native elements + child components) → emitCompositeElementReconciliation
 *   - Component-only → reconcileElements + createComponent
 *   - Plain element → reconcileElements + template + hydration
 * Then emits event delegation handlers if needed.
 */
function emitDynamicLoopUpdates(lines: string[], elem: TopLevelLoop): void {
  const keyFn = loopKeyFn(elem)

  if (elem.useElementReconciliation && (elem.nestedComponents?.length || elem.innerLoops?.length)) {
    emitCompositeElementReconciliation(lines, elem, keyFn)
  } else if (elem.childComponent) {
    emitComponentLoopReconciliation(lines, elem, keyFn)
  } else {
    emitPlainElementLoopReconciliation(lines, elem, keyFn)
  }
  lines.push('')

  // Event delegation for plain element loops (component loops handle events differently)
  if (!elem.childComponent && !elem.useElementReconciliation && elem.childEvents.length > 0) {
    emitDynamicLoopEventDelegation(lines, elem)
  }
}

/**
 * Build a props object expression string from component prop definitions.
 * Shared by emitComponentLoopReconciliation and emitCompositeElementReconciliation.
 */
export function buildComponentPropsExpr(
  comp: { props: Array<{ name: string; value: string; isEventHandler: boolean; isLiteral: boolean }>, children?: import('../types').IRNode[] },
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

/** Emit mapArray for a loop whose body is a single child component. */
function emitComponentLoopReconciliation(lines: string[], elem: TopLevelLoop, _keyFn: string): void {
  // _keyFn ignored — buildComponentLoopPlan recomputes via loopKeyFn(elem)
  // so the plan is self-contained. Kept in the signature so the dispatcher
  // doesn't need to learn the new shape yet.
  stringifyComponentLoop(lines, buildComponentLoopPlan(elem))
}

/** Emit mapArray for a plain element loop with unified CSR/SSR. */
function emitPlainElementLoopReconciliation(lines: string[], elem: TopLevelLoop, _keyFn: string): void {
  // _keyFn ignored — buildPlainLoopPlan recomputes via loopKeyFn(elem) so
  // the plan is self-contained. Kept in the signature so the dispatcher
  // (emitDynamicLoopUpdates) doesn't need to learn the new shape yet.
  stringifyPlainLoop(lines, buildPlainLoopPlan(elem))
}

/** Emit event delegation for dynamic (non-static) loop child events. */
function emitDynamicLoopEventDelegation(lines: string[], elem: TopLevelLoop): void {
  stringifyEventDelegation(lines, buildDynamicLoopDelegationPlan(elem))
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
  let handler = loopParam ? wrapLoopParamAsAccessor(ev.handler, loopParam, loopParamBindings) : ev.handler
  handler = wrapHandlerInBlock(handler)
  ls.push(`${indent}{ const __e = qsa(${elVar}, '[bf="${ev.childSlotId}"]'); if (__e) __e.addEventListener('${toDomEventName(ev.eventName)}', ${handler}) }`)
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

export function emitComponentAndEventSetup(
  ls: string[],
  indent: string,
  elVar: string,
  comps: TopLevelLoop['nestedComponents'] & {},
  events: LoopChildEvent[],
  mode: 'csr' | 'ssr',
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
    if (mode === 'csr') {
      const phId = comp.slotId || comp.name
      const keyProp = comp.props.find(p => p.name === 'key')
      const keyArg = keyProp ? `, ${wrap(keyProp.value)}` : ''
      if (childrenRefsLoop) {
        const wrappedChildren = wrap(rawChildrenExpr!)
        // Use qsa so the placeholder element is found even when it IS elVar itself
        // (e.g., loop body = bare component: <div data-bf-ph="sN"> is both the item and the placeholder).
        // When __ph === elVar, the element is detached so replaceWith is a no-op; reassign instead.
        ls.push(`${indent}{ const __ph = qsa(${elVar}, '[${DATA_BF_PH}="${phId}"]'); if (__ph) { const __comp = createComponent('${comp.name}', ${propsExpr}${keyArg}); if (__ph === ${elVar}) ${elVar} = __comp; else __ph.replaceWith(__comp); createEffect(() => { const __v = ${wrappedChildren}; __comp.textContent = Array.isArray(__v) ? __v.join('') : String(__v ?? '') }) } }`)
      } else {
        // Same qsa + reassignment fix for the non-children-reactive case.
        ls.push(`${indent}{ const __ph = qsa(${elVar}, '[${DATA_BF_PH}="${phId}"]'); if (__ph) { const __comp = createComponent('${comp.name}', ${propsExpr}${keyArg}); if (__ph === ${elVar}) ${elVar} = __comp; else __ph.replaceWith(__comp) } }`)
      }
    } else {
      const selector = buildCompSelector(comp)
      if (childrenRefsLoop) {
        const wrappedChildren = wrap(rawChildrenExpr!)
        ls.push(`${indent}{ const __c = qsa(${elVar}, '${selector}'); if (__c) { initChild('${comp.name}', __c, ${propsExpr}); createEffect(() => { const __v = ${wrappedChildren}; __c.textContent = Array.isArray(__v) ? __v.join('') : String(__v ?? '') }) } }`)
      } else {
        ls.push(`${indent}{ const __c = qsa(${elVar}, '${selector}'); if (__c) initChild('${comp.name}', __c, ${propsExpr}) }`)
      }
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

/**
 * Emit inner loop forEach + component/event setup for CSR and SSR.
 * Handles sibling loops at the same depth (emitted sequentially) and
 * nested loops at increasing depth (emitted inside their parent's forEach).
 * Levels are ordered by DFS walk, so child levels immediately follow their parent.
 */
export function emitInnerLoopSetup(
  ls: string[],
  indent: string,
  parentElVar: string,
  levels: DepthLevel[],
  mode: 'csr' | 'ssr',
  outerLoopParam?: string,
  outerLoopParamBindings?: readonly LoopParamBinding[],
): void {
  const wrapOuter = outerLoopParam
    ? (expr: string) => wrapLoopParamAsAccessor(expr, outerLoopParam, outerLoopParamBindings) : (expr: string) => expr
  let i = 0
  while (i < levels.length) {
    const level = levels[i]
    const inner = level.loopInfo
    if (!inner) { i++; continue }
    // Skip loops inside conditionals — they are handled by emitBranchInnerLoops
    // inside insert() bindEvents to avoid duplicate mapArray initialization
    if (inner.insideConditional) { i++; continue }

    // Collect child levels (immediately following with depth > current)
    const childLevels: DepthLevel[] = []
    let j = i + 1
    while (j < levels.length && levels[j].loopInfo && levels[j].loopInfo!.depth > inner.depth) {
      childLevels.push(levels[j])
      j++
    }

    // Use unique variable suffix to avoid name collisions between sibling loops
    const uid = `${inner.depth}_${i}`
    const arrayExpr = wrapOuter(inner.array)
    const containerSelector = inner.containerSlotId ? `'[bf="${inner.containerSlotId}"]'` : 'null'

    // `inner.refsOuterParam` is decided at collect-time against the
    // outermost loop param only — at depth 2+ the array expression typically
    // references the *immediate* parent loop's param (e.g. `g.items` inside
    // the `t.groups.map(g => ...)` body), so we re-check dynamically against
    // whatever `outerLoopParam` was passed in by our caller. Recursion
    // narrows `outerLoopParam` to `inner.param` for child levels (see end
    // of this branch), so each level decides correctly. Without this, deep
    // nested loops fall through to the static-forEach path and inserts /
    // removals at the deepest level never reach the DOM (observation O-8).
    const refsParent = !!outerLoopParam && exprReferencesIdent(inner.array, outerLoopParam)
    if (refsParent && inner.template) {
      // Reactive inner loop: use mapArray for proper add/remove/update.
      // NestedLoop never carries `index`, so loopKeyFn emits `(param) => ...`
      // — matching the plain-item-value contract that mapArray expects.
      const keyFn = loopKeyFn(inner)
      // Template is already wrapped at generation time (irToPlaceholderTemplate with loopParams)
      const wrappedTemplate = inner.template!
      const { head: innerHead, unwrap: innerUnwrap } = destructureLoopParam(inner.param, inner.paramBindings)
      ls.push(`${indent}// Reactive inner loop: ${inner.array}`)
      ls.push(`${indent}{ const __ic${uid} = ${containerSelector !== 'null' ? `qsa(${parentElVar}, ${containerSelector})` : parentElVar}`)
      ls.push(`${indent}if (__ic${uid}) mapArray(() => ${arrayExpr} || [], __ic${uid}, ${keyFn}, (${innerHead}, __innerIdx${uid}, __existing) => {`)
      if (innerUnwrap) {
        ls.push(`${indent}  ${innerUnwrap}`)
      }
      // SSR/CSR branch
      ls.push(`${indent}  let __innerEl${uid} = __existing ?? (() => { const __t = document.createElement('template'); __t.innerHTML = \`${wrappedTemplate}\`; return __t.content.firstElementChild.cloneNode(true) })()`)
      if (inner.key) {
        // Inside renderItem, inner.param is an accessor
        const wrappedKey = wrapLoopParamAsAccessor(inner.key, inner.param, inner.paramBindings)
        ls.push(`${indent}  __innerEl${uid}.setAttribute('${keyAttrName(inner.depth)}', String(${wrappedKey}))`)
      }
      // Set up components and events — wrap inner loop param as accessor
      if (level.comps.length > 0 || level.events.length > 0) {
        // Pre-wrap both component props and event handlers with inner loop param.
        // Children IR nodes must be wrapped recursively so nested component props
        // (e.g., SelectItem value inside SelectContent inside Select) also get
        // the inner loop param converted to signal accessor form.
        const wrapInner = (expr: string) => wrapLoopParamAsAccessor(expr, inner.param, inner.paramBindings)
        const wrapIRNode = (node: any): any => {
          if (node.type === 'component') {
            return {
              ...node,
              props: node.props.map((p: any) => p.isLiteral ? p : ({ ...p, value: wrapInner(p.value) })),
              children: node.children?.map(wrapIRNode),
            }
          }
          if (node.type === 'expression' && node.expr) {
            return { ...node, expr: wrapInner(node.expr) }
          }
          if (node.children) {
            return { ...node, children: node.children.map(wrapIRNode) }
          }
          return node
        }
        const wrappedComps = level.comps.map(comp => ({
          ...comp,
          props: comp.props.map(p => p.isLiteral ? p : ({ ...p, value: wrapInner(p.value) })),
          children: comp.children?.map(wrapIRNode),
        }))
        const wrappedEvents = level.events.map(ev => ({
          ...ev,
          handler: wrapInner(ev.handler),
        }))
        ls.push(`${indent}  if (!__existing) {`)
        emitComponentAndEventSetup(ls, `${indent}    `, `__innerEl${uid}`, wrappedComps, wrappedEvents, 'csr', outerLoopParam, outerLoopParamBindings)
        ls.push(`${indent}  } else {`)
        emitComponentAndEventSetup(ls, `${indent}    `, `__innerEl${uid}`, wrappedComps, wrappedEvents, 'ssr', outerLoopParam, outerLoopParamBindings)
        ls.push(`${indent}  }`)
      }
      // Recurse for child levels — pass `inner.param` as the outer for the
      // next level so deeper inner loops see their *immediate* parent and
      // correctly hit the reactive (mapArray) branch above.
      if (childLevels.length > 0) {
        emitInnerLoopSetup(ls, `${indent}  `, `__innerEl${uid}`, childLevels, mode, inner.param, inner.paramBindings)
      }
      // Reactive text effects for inner loop items
      if (inner.childReactiveTexts && inner.childReactiveTexts.length > 0) {
        for (const text of inner.childReactiveTexts) {
          const wrappedExpr = wrapLoopParamAsAccessor(wrapOuter(text.expression), inner.param, inner.paramBindings)
          if (text.insideConditional) {
            // Text is inside a conditional branch: insert() may replace the DOM element,
            // making a captured text node stale. Re-query $t inside the effect so each
            // update always finds the current live text node.
            ls.push(`${indent}  createEffect(() => { const [__rt] = $t(__innerEl${uid}, '${text.slotId}'); if (__rt) __rt.textContent = String(${wrappedExpr}) })`)
          } else {
            ls.push(`${indent}  { const [__rt] = $t(__innerEl${uid}, '${text.slotId}')`)
            ls.push(`${indent}  if (__rt) createEffect(() => { __rt.textContent = String(${wrappedExpr}) }) }`)
          }
        }
      }
      ls.push(`${indent}  return __innerEl${uid}`)
      ls.push(`${indent}}) }`)
    } else {
      // Static inner loop: use forEach for initial setup only
      ls.push(`${indent}// Initialize ${inner.array} loop components and events`)
      ls.push(`${indent}{ const __ic${uid} = ${containerSelector !== 'null' ? `qsa(${parentElVar}, ${containerSelector})` : parentElVar}`)
      // Guard: inner loop array may be undefined when inside a conditional branch
      ls.push(`${indent}if (__ic${uid} && ${arrayExpr}) ${arrayExpr}.forEach((${inner.param}, __innerIdx${uid}) => {`)
      ls.push(`${indent}  const __innerEl${uid} = __ic${uid}.children[__innerIdx${uid}]`)
      ls.push(`${indent}  if (!__innerEl${uid}) return`)
      if (inner.key) {
        ls.push(`${indent}  __innerEl${uid}.setAttribute('${keyAttrName(inner.depth)}', String(${inner.key}))`)
      }
      emitComponentAndEventSetup(ls, `${indent}  `, `__innerEl${uid}`, level.comps, level.events, mode, outerLoopParam, outerLoopParamBindings)
      // Recurse for child levels (nested deeper loops) — narrow parent like
      // the reactive branch above so a static-then-reactive nesting still
      // hits the reactive path at the next level.
      if (childLevels.length > 0) {
        emitInnerLoopSetup(ls, `${indent}  `, `__innerEl${uid}`, childLevels, mode, inner.param, inner.paramBindings)
      }
      ls.push(`${indent}}) }`)
    }

    i = j // skip past this level + its children
  }
}

/**
 * Emit reconcileElements with composite rendering for dynamic loops whose
 * native-element body contains child components.
 */
function emitCompositeElementReconciliation(
  lines: string[],
  elem: TopLevelLoop,
  _keyFn: string,
): void {
  // _keyFn ignored — buildTopLevelCompositePlan recomputes via loopKeyFn(elem).
  stringifyCompositeLoop(lines, buildTopLevelCompositePlan(elem))
}

