/**
 * Control flow emission: conditionals and loops.
 * Handles insert() for reactive conditionals, reconcileElements for dynamic loops,
 * and event delegation within loop containers.
 */

import type { ClientJsContext, ConditionalBranchEvent, BranchLoop, BranchSummary, ConditionalElement, LoopChildEvent, LoopChildConditional, TopLevelLoop, NestedLoop, CollectedLoop } from './types'
import type { IRLoopChildComponent, LoopParamBinding } from '../types'
import { toDomEventName, wrapHandlerInBlock, varSlotId, buildChainedArrayExpr, quotePropName, DATA_KEY, DATA_BF_PH, keyAttrName, wrapLoopParamAsAccessor, exprReferencesIdent, substituteLoopBindings } from './utils'
import { addCondAttrToTemplate, irChildrenToJsExpr } from './html-template'
import { emitAttrUpdate } from './emit-reactive'

/**
 * Build the `keyFn` argument for mapArray / reconcileElements. `null` when
 * the loop has no key expression. Narrowing on `loop.kind` keeps `index`
 * off `NestedLoop` (nested loops never thread an explicit index parameter)
 * and lets the compiler verify we handled every flavour exhaustively.
 */
function loopKeyFn(loop: CollectedLoop): string {
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
function destructureLoopParam(
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
 * Emit find() + event binding + ref callbacks + child component inits for a conditional branch.
 * Used by both emitConditionalUpdates and emitClientOnlyConditionals.
 */
function emitBranchBindings(
  lines: string[],
  branch: BranchSummary,
  eventNameFn: (eventName: string) => string,
): void {
  const { events, refs, childComponents, textEffects, loops: branchLoops, conditionals: branchConditionals } = branch
  const allSlotIds = new Set<string>()
  for (const event of events) allSlotIds.add(event.slotId)
  for (const ref of refs) allSlotIds.add(ref.slotId)

  const eventsBySlot = new Map<string, ConditionalBranchEvent[]>()
  for (const event of events) {
    if (!eventsBySlot.has(event.slotId)) {
      eventsBySlot.set(event.slotId, [])
    }
    eventsBySlot.get(event.slotId)!.push(event)
  }

  if (allSlotIds.size > 0) {
    const slotArr = [...allSlotIds]
    const vars = slotArr.map(id => `_${varSlotId(id)}`).join(', ')
    const args = slotArr.map(id => `'${id}'`).join(', ')
    lines.push(`      const [${vars}] = $(__branchScope, ${args})`)
  }

  for (const [slotId, slotEvents] of eventsBySlot) {
    const v = varSlotId(slotId)
    for (const event of slotEvents) {
      const wrappedHandler = wrapHandlerInBlock(event.handler)
      lines.push(`      if (_${v}) _${v}.addEventListener('${eventNameFn(event.eventName)}', ${wrappedHandler})`)
    }
  }

  for (const ref of refs) {
    const v = varSlotId(ref.slotId)
    lines.push(`      if (_${v}) (${ref.callback})(_${v})`)
  }

  // Initialize child components created by the branch swap
  for (let i = 0; i < childComponents.length; i++) {
    const comp = childComponents[i]
    const varName = `__c${i}`
    const selectorArg = comp.slotId || comp.name
    lines.push(`      const [${varName}] = $c(__branchScope, '${selectorArg}')`)
    lines.push(`      if (${varName}) initChild('${comp.name}', ${varName}, ${comp.propsExpr})`)
  }

  // Emit disposable effects scoped to this branch (text effects, loop reconciliation, nested conditionals).
  // These only run while the branch is active and are disposed on branch switch.
  const hasDisposables = textEffects.length > 0 || branchLoops.length > 0 || branchConditionals.length > 0
  if (hasDisposables) {
    lines.push(`      const __disposers = []`)

    for (const te of textEffects) {
      const v = varSlotId(te.slotId)
      lines.push(`      const [__el_${v}] = $t(__branchScope, '${te.slotId}')`)
      lines.push(`      __disposers.push(createDisposableEffect(() => {`)
      lines.push(`        const __val = ${te.expression}`)
      lines.push(`        if (__el_${v} && !__val?.__isSlot) __el_${v}.nodeValue = String(__val ?? '')`)
      lines.push(`      }))`)
    }

    // Emit loop reconciliation effects for loops inside this branch.
    // The loop's container is found via $() and updated reactively via reconcileElements.
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

        if (!hasReactiveEffects) {
          // Simple case: no reactive effects — return existing DOM as-is.
          // Template expressions use loopParam() to read the current item, so the
          // signal accessor stays intact without any unwrap.
          if (loop.mapPreamble) {
            lines.push(`      if (__loop_${cv}) mapArray(() => ${loop.array}, __loop_${cv}, ${keyFn}, (${pHead}, ${indexParam}, __existing) => { ${unwrapInline}if (__existing) return __existing; ${loop.mapPreamble}; const __tpl = document.createElement('template'); __tpl.innerHTML = \`${loop.template}\`; return __tpl.content.firstElementChild.cloneNode(true) })`)
          } else {
            lines.push(`      if (__loop_${cv}) mapArray(() => ${loop.array}, __loop_${cv}, ${keyFn}, (${pHead}, ${indexParam}, __existing) => { ${unwrapInline}if (__existing) return __existing; const __tpl = document.createElement('template'); __tpl.innerHTML = \`${loop.template}\`; return __tpl.content.firstElementChild.cloneNode(true) })`)
          }
        } else {
          // Multi-line renderItem with fine-grained effects — applies to both
          // SSR (existing DOM) and CSR (freshly created) paths so reactive reads
          // of non-item signals propagate to existing items too.
          lines.push(`      if (__loop_${cv}) mapArray(() => ${loop.array}, __loop_${cv}, ${keyFn}, (${pHead}, ${indexParam}, __existing) => {`)
          if (pUnwrap) {
            lines.push(`        ${pUnwrap}`)
          }
          if (loop.mapPreamble) {
            lines.push(`        ${loop.mapPreamble}`)
          }
          lines.push(`        const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = \`${loop.template}\`; return __tpl.content.firstElementChild.cloneNode(true) })()`)
          emitLoopChildReactiveEffects(
            lines,
            '        ',
            '__el',
            loop.childReactiveAttrs ?? [],
            loop.childReactiveTexts ?? [],
            loop.childConditionals,
            loop.param,
            loop.paramBindings,
          )
          lines.push(`        return __el`)
          lines.push(`      })`)
        }
        emitBranchLoopEventDelegation(lines, loop, cv)
      }
    }

    // Emit nested conditionals as insert() calls inside this branch.
    // These are disposed when the parent branch switches, ensuring inner
    // conditionals are re-set-up each time the parent branch activates.
    for (const cond of branchConditionals) {
      emitNestedBranchConditional(lines, cond, eventNameFn)
    }

    lines.push(`      return () => __disposers.forEach(d => d())`)
  }
}

/**
 * Emit a nested conditional as an insert() call inside a parent branch's bindEvents.
 * The insert is wrapped so its effects are disposed when the parent branch deactivates.
 */
function emitNestedBranchConditional(
  lines: string[],
  elem: ConditionalElement,
  eventNameFn: (eventName: string) => string,
): void {
  const whenTrueWithCond = addCondAttrToTemplate(elem.whenTrueHtml, elem.slotId)
  const whenFalseWithCond = addCondAttrToTemplate(elem.whenFalseHtml, elem.slotId)

  lines.push(`      insert(__branchScope, '${elem.slotId}', () => ${elem.condition}, {`)
  lines.push(`        template: () => \`${whenTrueWithCond}\`,`)
  lines.push(`        bindEvents: (__branchScope) => {`)
  emitBranchBindings(lines, elem.whenTrue, eventNameFn)
  lines.push(`        }`)
  lines.push(`      }, {`)
  lines.push(`        template: () => \`${whenFalseWithCond}\`,`)
  lines.push(`        bindEvents: (__branchScope) => {`)
  emitBranchBindings(lines, elem.whenFalse, eventNameFn)
  lines.push(`        }`)
  lines.push(`      })`)
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
  const nestedComps = loop.nestedComponents!
  const innerLoops = loop.innerLoops ?? []
  const childEvents = loop.childEvents
  const indexParam = loop.index || '__idx'

  const depthLevels = buildDepthLevels(innerLoops, nestedComps, childEvents)

  const outerComps = nestedComps.filter(c => !c.loopDepth || c.loopDepth === 0)
  const outerEvents = childEvents.filter(ev => ev.nestedLoops.length === 0)

  // Build a partial TopLevelLoop-compatible object for CompositeLoopContext
  const pseudoElem = {
    param: loop.param,
    template: loop.template,
    mapPreamble: loop.mapPreamble ?? undefined,
    childReactiveTexts: loop.childReactiveTexts ?? [],
    childReactiveAttrs: loop.childReactiveAttrs ?? [],
    childConditionals: loop.childConditionals ?? [],
  } as unknown as TopLevelLoop

  const ctx: CompositeLoopContext = {
    elem: pseudoElem,
    outerComps,
    outerEvents,
    depthLevels,
  }

  const keyFn = loopKeyFn(loop)

  const { head: pHead, unwrap: pUnwrap } = destructureLoopParam(loop.param, loop.paramBindings)

  // Wrap everything in a disposable effect for branch cleanup
  // Clear template-generated children so mapArray creates fresh elements
  // with properly initialized components via createComponent in renderItem.
  lines.push(`      if (__loop_${cv}) getLoopChildren(__loop_${cv}).forEach(__el => __el.remove())`)
  lines.push(`      if (__loop_${cv}) mapArray(() => ${loop.array}, __loop_${cv}, ${keyFn}, (${pHead}, ${indexParam}, __existing) => {`)
  if (pUnwrap) {
    lines.push(`        ${pUnwrap}`)
  }
  emitCompositeRenderItemBody(lines, '        ', ctx)
  lines.push(`      })`)
}

/** Emit insert() calls for server-rendered reactive conditionals with branch configs. */
export function emitConditionalUpdates(lines: string[], ctx: ClientJsContext): void {
  for (const elem of ctx.conditionalElements) {
    const whenTrueWithCond = addCondAttrToTemplate(elem.whenTrueHtml, elem.slotId)
    const whenFalseWithCond = addCondAttrToTemplate(elem.whenFalseHtml, elem.slotId)

    lines.push(`  insert(__scope, '${elem.slotId}', () => ${elem.condition}, {`)
    lines.push(`    template: () => \`${whenTrueWithCond}\`,`)
    lines.push(`    bindEvents: (__branchScope) => {`)
    emitBranchBindings(lines, elem.whenTrue, toDomEventName)
    lines.push(`    }`)
    lines.push(`  }, {`)
    lines.push(`    template: () => \`${whenFalseWithCond}\`,`)
    lines.push(`    bindEvents: (__branchScope) => {`)
    emitBranchBindings(lines, elem.whenFalse, toDomEventName)
    lines.push(`    }`)
    lines.push(`  })`)
    lines.push('')
  }
}

/** Emit insert() calls for client-only conditionals (not server-rendered). */
export function emitClientOnlyConditionals(lines: string[], ctx: ClientJsContext): void {
  for (const elem of ctx.clientOnlyConditionals) {
    const whenTrueWithCond = addCondAttrToTemplate(elem.whenTrueHtml, elem.slotId)
    const whenFalseWithCond = addCondAttrToTemplate(elem.whenFalseHtml, elem.slotId)
    const rawEventName = (eventName: string) => eventName

    lines.push(`  // @client conditional: ${elem.slotId}`)
    lines.push(`  insert(__scope, '${elem.slotId}', () => ${elem.condition}, {`)
    lines.push(`    template: () => \`${whenTrueWithCond}\`,`)
    lines.push(`    bindEvents: (__branchScope) => {`)
    emitBranchBindings(lines, elem.whenTrue, rawEventName)
    lines.push(`    }`)
    lines.push(`  }, {`)
    lines.push(`    template: () => \`${whenFalseWithCond}\`,`)
    lines.push(`    bindEvents: (__branchScope) => {`)
    emitBranchBindings(lines, elem.whenFalse, rawEventName)
    lines.push(`    }`)
    lines.push(`  })`)
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

function emitLoopChildReactiveEffects(
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

  // Reactive attribute effects for plain elements in static arrays.
  if (!elem.childComponent && elem.childReactiveAttrs.length > 0) {
    const v = varSlotId(elem.slotId)
    lines.push(`  // Reactive attributes in static array children`)
    lines.push(`  if (_${v}) {`)
    const indexParam = elem.index || '__idx'
    const offsetExpr = elem.siblingOffset ? `${indexParam} + ${elem.siblingOffset}` : indexParam
    lines.push(`    ${elem.array}.forEach((${elem.param}, ${indexParam}) => {`)
    lines.push(`      const __iterEl = _${v}.children[${offsetExpr}]`)
    lines.push(`      if (__iterEl) {`)
    // Group attrs by childSlotId to avoid duplicate const declarations
    const attrsBySlot = new Map<string, typeof elem.childReactiveAttrs>()
    for (const attr of elem.childReactiveAttrs) {
      if (!attrsBySlot.has(attr.childSlotId)) {
        attrsBySlot.set(attr.childSlotId, [])
      }
      attrsBySlot.get(attr.childSlotId)!.push(attr)
    }
    for (const [slotId, attrs] of attrsBySlot) {
      const varName = `__t_${varSlotId(slotId)}`
      lines.push(`        const ${varName} = qsa(__iterEl, '[bf="${slotId}"]')`)
      lines.push(`        if (${varName}) {`)
      for (const attr of attrs) {
        lines.push(`          createEffect(() => {`)
        for (const stmt of emitAttrUpdate(varName, attr.attrName, attr.expression, attr)) {
          lines.push(`            ${stmt}`)
        }
        lines.push(`          })`)
      }
      lines.push(`        }`)
    }
    lines.push(`      }`)
    lines.push(`    })`)
    lines.push(`  }`)
    lines.push('')
  }

  // Reactive text effects for static array children (both plain and component loops).
  // Text expressions that read signals (e.g., {isAnnual() ? x : y}) need
  // createEffect to update when the signal changes.
  if (elem.childReactiveTexts.length > 0) {
    const v = varSlotId(elem.slotId)
    lines.push(`  // Reactive texts in static array children`)
    lines.push(`  if (_${v}) {`)
    const indexParam = elem.index || '__idx'
    const offsetExpr2 = elem.siblingOffset ? `${indexParam} + ${elem.siblingOffset}` : indexParam
    lines.push(`    ${elem.array}.forEach((${elem.param}, ${indexParam}) => {`)
    lines.push(`      const __iterEl = _${v}.children[${offsetExpr2}]`)
    lines.push(`      if (__iterEl) {`)
    for (const text of elem.childReactiveTexts) {
      const vn = `__rt_${varSlotId(text.slotId)}`
      lines.push(`        { const [${vn}] = $t(__iterEl, '${text.slotId}')`)
      lines.push(`        if (${vn}) createEffect(() => { ${vn}.textContent = String(${text.expression}) }) }`)
    }
    lines.push(`      }`)
    lines.push(`    })`)
    lines.push(`  }`)
    lines.push('')
  }

  // Event delegation for plain elements in static arrays (#537).
  // Static arrays have no data-key/bf-i markers, so walk up from target to
  // the container's direct child and use indexOf for index lookup.
  if (!elem.childComponent && elem.childEvents.length > 0) {
    const v = varSlotId(elem.slotId)
    emitLoopEventDelegation(lines, `_${v}`, elem.childEvents, (ls, ev, handlerCall, cVar) => {
      ls.push(`      let __el = ${varSlotId(ev.childSlotId)}El`)
      ls.push(`      while (__el.parentElement && __el.parentElement !== ${cVar}) __el = __el.parentElement`)
      ls.push(`      if (__el.parentElement === ${cVar}) {`)
      const idxOffset = elem.siblingOffset ? ` - ${elem.siblingOffset}` : ''
      ls.push(`        const __idx = Array.from(${cVar}.children).indexOf(__el)${idxOffset}`)
      ls.push(`        const ${elem.param} = ${elem.array}[__idx]`)
      if (elem.mapPreamble) ls.push(`        ${elem.mapPreamble}`)
      ls.push(`        if (${elem.param}) ${handlerCall}`)
      ls.push(`      }`)
    })
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
function buildComponentPropsExpr(
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
function emitComponentLoopReconciliation(lines: string[], elem: TopLevelLoop, keyFn: string): void {
  const { name } = elem.childComponent!
  const vLoop = varSlotId(elem.slotId)
  const propsExpr = buildComponentPropsExpr(elem.childComponent!, elem.param)
  const keyExpr = wrapLoopParamAsAccessor(elem.key || '__idx', elem.param, elem.paramBindings)
  const indexParam = elem.index || '__idx'
  const chainedExpr = buildChainedArrayExpr(elem)
  // Only init components at loopDepth 0 — inner-loop components are handled by their own loop
  const nestedComps = (elem.nestedComponents ?? []).filter(c => !c.loopDepth)
  const { head: pHead, unwrap: pUnwrap } = destructureLoopParam(elem.param, elem.paramBindings)

  lines.push(`  mapArray(() => ${chainedExpr}, _${vLoop}, ${keyFn}, (${pHead}, ${indexParam}, __existing) => {`)
  if (pUnwrap) {
    lines.push(`    ${pUnwrap}`)
  }
  if (nestedComps.length > 0) {
    // Unified renderItem: SSR hydrates nested components, CSR creates from scratch
    lines.push(`    if (__existing) {`)
    lines.push(`      initChild('${name}', __existing, ${propsExpr})`)
    // Initialize nested child components within the SSR-rendered element
    for (const comp of nestedComps) {
      const selector = buildCompSelector(comp)
      const nestedPropsExpr = buildComponentPropsExpr(comp, elem.param)
      // Check if children are text-only and reference the loop param.
      // Only text-only children can safely use textContent update;
      // children containing elements/components would be destroyed.
      const isTextOnly = comp.children?.length
        ? comp.children.every(c => c.type === 'expression' || c.type === 'text' || isTextOnlyConditional(c))
        : false
      const rawChildrenExpr = isTextOnly ? irChildrenToJsExpr(comp.children!) : null
      const childrenRefsLoop = rawChildrenExpr != null && exprReferencesIdent(rawChildrenExpr, elem.param)
      if (childrenRefsLoop) {
        const wrappedChildren = wrapLoopParamAsAccessor(rawChildrenExpr, elem.param, elem.paramBindings)
        lines.push(`      { const __c = qsa(__existing, '${selector}'); if (__c) { initChild('${comp.name}', __c, ${nestedPropsExpr}); createEffect(() => { const __v = ${wrappedChildren}; __c.textContent = Array.isArray(__v) ? __v.join('') : String(__v ?? '') }) } }`)
      } else {
        lines.push(`      { const __c = qsa(__existing, '${selector}'); if (__c) initChild('${comp.name}', __c, ${nestedPropsExpr}) }`)
      }
    }
    // Emit reactive effects for conditionals/texts inside component children
    if (elem.childConditionals && elem.childConditionals.length > 0) {
      emitLoopChildReactiveEffects(lines, '      ', '__existing', [], [], elem.childConditionals, elem.param, elem.paramBindings)
    }
    lines.push(`      return __existing`)
    lines.push(`    }`)
    lines.push(`    const __csrEl = createComponent('${name}', ${propsExpr}, ${keyExpr})`)
    for (const comp of nestedComps) {
      const selector = buildCompSelector(comp)
      const nestedPropsExpr = buildComponentPropsExpr(comp, elem.param)
      const isTextOnly = comp.children?.length
        ? comp.children.every(c => c.type === 'expression' || c.type === 'text' || isTextOnlyConditional(c))
        : false
      const rawChildrenExpr = isTextOnly ? irChildrenToJsExpr(comp.children!) : null
      const childrenRefsLoop = rawChildrenExpr != null && exprReferencesIdent(rawChildrenExpr, elem.param)
      if (childrenRefsLoop) {
        const wrappedChildren = wrapLoopParamAsAccessor(rawChildrenExpr, elem.param, elem.paramBindings)
        lines.push(`    { const __c = qsa(__csrEl, '${selector}'); if (__c) { initChild('${comp.name}', __c, ${nestedPropsExpr}); createEffect(() => { const __v = ${wrappedChildren}; __c.textContent = Array.isArray(__v) ? __v.join('') : String(__v ?? '') }) } }`)
      } else {
        lines.push(`    { const __c = qsa(__csrEl, '${selector}'); if (__c) initChild('${comp.name}', __c, ${nestedPropsExpr}) }`)
      }
    }
    if (elem.childConditionals && elem.childConditionals.length > 0) {
      emitLoopChildReactiveEffects(lines, '    ', '__csrEl', [], [], elem.childConditionals, elem.param, elem.paramBindings)
    }
    lines.push(`    return __csrEl`)
  } else {
    lines.push(`    if (__existing) { initChild('${name}', __existing, ${propsExpr}); return __existing }`)
    lines.push(`    return createComponent('${name}', ${propsExpr}, ${keyExpr})`)
  }
  lines.push(`  })`)
}

/**
 * Emit the hydration guard and data-key tagging for loop elements.
 * Shared between plain element and composite element reconciliation.
 * After tagging, calls afterTag callback for additional per-child setup (e.g., component init).
 */
function emitHydrationTagging(
  lines: string[],
  elem: TopLevelLoop,
  vLoop: string,
  indexParam: string,
  afterTag?: (lines: string[]) => void,
): void {
  // Hydration guard: check if loop children already have data-key.
  // Use getLoopChildren (respects bf-loop markers from SSR) instead of
  // firstElementChild to avoid false positives from non-loop siblings.
  lines.push(`    const __loopChildren = getLoopChildren(_${vLoop})`)
  lines.push(`    if (__loopChildren.length > 0 && !__loopChildren[0]?.hasAttribute('${DATA_KEY}')) {`)
  lines.push(`      __loopChildren.forEach((__hChild, ${indexParam}) => {`)
  lines.push(`        if (${indexParam} >= __arr.length) return`)
  lines.push(`        const ${elem.param} = __arr[${indexParam}]`)
  if (elem.key) {
    lines.push(`        __hChild.setAttribute('${DATA_KEY}', String(${elem.key}))`)
  } else {
    lines.push(`        __hChild.setAttribute('${DATA_KEY}', String(${indexParam}))`)
  }
  afterTag?.(lines)
  lines.push(`      })`)
  lines.push(`      if (__arr.length > 0) __renderItem(__arr[0], 0)`)
  lines.push(`      return`)
  lines.push(`    }`)
}

/** Emit mapArray for a plain element loop with unified CSR/SSR. */
function emitPlainElementLoopReconciliation(lines: string[], elem: TopLevelLoop, keyFn: string): void {
  const vLoop = varSlotId(elem.slotId)
  const chainedExpr = buildChainedArrayExpr(elem)
  const indexParam = elem.index || '__idx'
  const wrap = (expr: string) => wrapLoopParamAsAccessor(expr, elem.param, elem.paramBindings)

  const hasReactiveEffects = elem.childReactiveAttrs.length > 0
    || elem.childReactiveTexts.length > 0
    || (elem.childConditionals?.length ?? 0) > 0
  const { head: pHead, unwrap: pUnwrap } = destructureLoopParam(elem.param, elem.paramBindings)
  const unwrapInline = pUnwrap ? `${pUnwrap} ` : ''

  if (!hasReactiveEffects) {
    // Simple case: no reactive effects
    // Template is already wrapped at generation time (irToPlaceholderTemplate with loopParams)
    const preamble = elem.mapPreamble ? `${wrap(elem.mapPreamble)}; ` : ''
    lines.push(`  mapArray(() => ${chainedExpr}, _${vLoop}, ${keyFn}, (${pHead}, ${indexParam}, __existing) => { ${unwrapInline}${preamble}if (__existing) return __existing; const __tpl = document.createElement('template'); __tpl.innerHTML = \`${elem.template}\`; return __tpl.content.firstElementChild.cloneNode(true) })`)
  } else {
    // Multi-line renderItem with fine-grained effects (shared for CSR and SSR)
    lines.push(`  mapArray(() => ${chainedExpr}, _${vLoop}, ${keyFn}, (${pHead}, ${indexParam}, __existing) => {`)
    if (pUnwrap) {
      lines.push(`    ${pUnwrap}`)
    }
    if (elem.mapPreamble) {
      lines.push(`    ${wrap(elem.mapPreamble)}`)
    }
    // Template is already wrapped at generation time (irToPlaceholderTemplate with loopParams)
    lines.push(`    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = \`${elem.template}\`; return __tpl.content.firstElementChild.cloneNode(true) })()`)
    emitLoopChildReactiveEffects(lines, '    ', '__el', elem.childReactiveAttrs, elem.childReactiveTexts, elem.childConditionals, elem.param, elem.paramBindings)
    lines.push(`    return __el`)
    lines.push(`  })`)
  }
}

/** Emit event delegation for dynamic (non-static) loop child events. */
function emitDynamicLoopEventDelegation(lines: string[], elem: TopLevelLoop): void {
  const vLoop = varSlotId(elem.slotId)
  const hasBindings = (elem.paramBindings?.length ?? 0) > 0

  if (elem.key) {
    // Dynamic keyed: find item by data-key attribute.
    // For destructured `.map(({ id }) => ...)`, the raw regex replace below
    // can't reach binding names (the pattern text `{ id }` never word-matches
    // on `id`), so we substitute bindings with `item.<path>` directly (#951).
    const keyWithItem = hasBindings
      ? substituteLoopBindings(elem.key, elem.paramBindings!, 'item')
      : elem.key.replace(new RegExp(`\\b${elem.param}\\b`, 'g'), 'item')
    emitLoopEventDelegation(lines, `_${vLoop}`, elem.childEvents, (ls, ev, handlerCall) => {
      if (ev.nestedLoops.length === 0) {
        // Direct child of outer loop — single-level lookup.
        // For destructured outer param, `const { id } = arr.find(item => ...)`
        // would throw a TDZ ReferenceError if the find callback references the
        // outer `id` while the `const` is still being declared. Land on a
        // plain `__bfLoopItem` local first, then destructure once the lookup
        // is done (#951).
        ls.push(`      const li = ${varSlotId(ev.childSlotId)}El.closest('[${DATA_KEY}]')`)
        ls.push(`      if (li) {`)
        ls.push(`        const key = li.getAttribute('${DATA_KEY}')`)
        if (hasBindings) {
          ls.push(`        const __bfLoopItem = ${elem.array}.find(item => String(${keyWithItem}) === key)`)
          ls.push(`        if (__bfLoopItem) {`)
          ls.push(`          const ${elem.param} = __bfLoopItem`)
          if (elem.mapPreamble) ls.push(`          ${elem.mapPreamble}`)
          ls.push(`          ${handlerCall}`)
          ls.push(`        }`)
        } else {
          ls.push(`        const ${elem.param} = ${elem.array}.find(item => String(${keyWithItem}) === key)`)
          if (elem.mapPreamble) ls.push(`        ${elem.mapPreamble}`)
          ls.push(`        if (${elem.param}) ${handlerCall}`)
        }
        ls.push(`      }`)
      } else {
        // Nested loop event — multi-level data-key-N resolution
        const evVar = varSlotId(ev.childSlotId)
        // Resolve inner loop keys (innermost first)
        for (const nested of ev.nestedLoops) {
          const dataAttr = keyAttrName(nested.depth)
          ls.push(`      const innerLi${nested.depth} = ${evVar}El.closest('[${dataAttr}]')`)
          ls.push(`      const innerKey${nested.depth} = innerLi${nested.depth}?.getAttribute('${dataAttr}')`)
        }
        // Resolve outer loop key
        ls.push(`      const outerLi = ${evVar}El.closest('[${DATA_KEY}]')`)
        ls.push(`      const outerKey = outerLi?.getAttribute('${DATA_KEY}')`)
        // Resolve outer loop variable — TDZ-safe for destructured params.
        if (hasBindings) {
          ls.push(`      const __bfLoopItem = ${elem.array}.find(item => String(${keyWithItem}) === outerKey)`)
          ls.push(`      const ${elem.param} = __bfLoopItem ?? ({})`)
        } else {
          ls.push(`      const ${elem.param} = ${elem.array}.find(item => String(${keyWithItem}) === outerKey)`)
        }
        // Resolve inner loop variables via the outer param's nested array.
        // Destructured inner params get the same `substituteLoopBindings`
        // treatment; otherwise fall through to the legacy regex replace.
        for (const nested of ev.nestedLoops) {
          // `nested.key` can be null for unkeyed loops; coerce to '' so the
          // resolution silently no-ops (String('') never matches a real
          // key), matching prior behavior when NestedLoop.key was
          // always a string defaulting to ''.
          const rawKey = nested.key ?? ''
          const innerKeyExpr = nested.paramBindings && nested.paramBindings.length > 0
            ? substituteLoopBindings(rawKey, nested.paramBindings, 'item')
            : rawKey.replace(new RegExp(`\\b${nested.param}\\b`, 'g'), 'item')
          const outerRef = hasBindings ? '__bfLoopItem' : elem.param
          ls.push(`      const ${nested.param} = ${outerRef} && ${nested.array}.find(item => String(${innerKeyExpr}) === innerKey${nested.depth})`)
        }
        // Guard all resolved variables — for destructured outer we use the
        // __bfLoopItem sentinel because the pattern text itself isn't truthy-testable.
        const outerGuard = hasBindings ? '__bfLoopItem' : elem.param
        const allParams = [outerGuard, ...ev.nestedLoops.map(n => n.param)]
        if (elem.mapPreamble) ls.push(`      ${elem.mapPreamble}`)
        ls.push(`      if (${allParams.join(' && ')}) ${handlerCall}`)
      }
    })
  } else {
    // Dynamic non-keyed: find item by index in parent children
    emitLoopEventDelegation(lines, `_${vLoop}`, elem.childEvents, (ls, ev, handlerCall) => {
      ls.push(`      const li = ${varSlotId(ev.childSlotId)}El.closest('li, [bf-i]')`)
      ls.push(`      if (li && li.parentElement) {`)
      ls.push(`        const idx = Array.from(li.parentElement.children).indexOf(li)`)
      if (hasBindings) {
        ls.push(`        const __bfLoopItem = ${elem.array}[idx]`)
        ls.push(`        if (__bfLoopItem) {`)
        ls.push(`          const ${elem.param} = __bfLoopItem`)
        if (elem.mapPreamble) ls.push(`          ${elem.mapPreamble}`)
        ls.push(`          ${handlerCall}`)
        ls.push(`        }`)
      } else {
        ls.push(`        const ${elem.param} = ${elem.array}[idx]`)
        if (elem.mapPreamble) ls.push(`        ${elem.mapPreamble}`)
        ls.push(`        if (${elem.param}) ${handlerCall}`)
      }
      ls.push(`      }`)
    })
  }
}

/**
 * Emit event delegation for simple (non-composite) loops inside conditional branches (#766).
 * Mirrors emitDynamicLoopEventDelegation but uses branch-scoped container variable.
 */
function emitBranchLoopEventDelegation(lines: string[], loop: BranchLoop, cv: string): void {
  const containerVar = `__loop_${cv}`
  const childEvents = loop.childEvents
  const hasBindings = (loop.paramBindings?.length ?? 0) > 0

  if (loop.key) {
    // Keyed: find item by data-key attribute. See emitDynamicLoopEventDelegation
    // for the destructured-param TDZ-safe shape (#951).
    const keyWithItem = hasBindings
      ? substituteLoopBindings(loop.key, loop.paramBindings!, 'item')
      : loop.key.replace(new RegExp(`\\b${loop.param}\\b`, 'g'), 'item')
    emitLoopEventDelegation(lines, containerVar, childEvents, (ls, ev, handlerCall) => {
      if (ev.nestedLoops.length === 0) {
        ls.push(`      const li = ${varSlotId(ev.childSlotId)}El.closest('[${DATA_KEY}]')`)
        ls.push(`      if (li) {`)
        ls.push(`        const key = li.getAttribute('${DATA_KEY}')`)
        if (hasBindings) {
          ls.push(`        const __bfLoopItem = ${loop.array}.find(item => String(${keyWithItem}) === key)`)
          ls.push(`        if (__bfLoopItem) {`)
          ls.push(`          const ${loop.param} = __bfLoopItem`)
          if (loop.mapPreamble) ls.push(`          ${loop.mapPreamble}`)
          ls.push(`          ${handlerCall}`)
          ls.push(`        }`)
        } else {
          ls.push(`        const ${loop.param} = ${loop.array}.find(item => String(${keyWithItem}) === key)`)
          if (loop.mapPreamble) ls.push(`        ${loop.mapPreamble}`)
          ls.push(`        if (${loop.param}) ${handlerCall}`)
        }
        ls.push(`      }`)
      } else {
        // Nested loop event — multi-level data-key-N resolution
        const evVar = varSlotId(ev.childSlotId)
        for (const nested of ev.nestedLoops) {
          const dataAttr = keyAttrName(nested.depth)
          ls.push(`      const innerLi${nested.depth} = ${evVar}El.closest('[${dataAttr}]')`)
          ls.push(`      const innerKey${nested.depth} = innerLi${nested.depth}?.getAttribute('${dataAttr}')`)
        }
        ls.push(`      const outerLi = ${evVar}El.closest('[${DATA_KEY}]')`)
        ls.push(`      const outerKey = outerLi?.getAttribute('${DATA_KEY}')`)
        if (hasBindings) {
          ls.push(`      const __bfLoopItem = ${loop.array}.find(item => String(${keyWithItem}) === outerKey)`)
          ls.push(`      const ${loop.param} = __bfLoopItem ?? ({})`)
        } else {
          ls.push(`      const ${loop.param} = ${loop.array}.find(item => String(${keyWithItem}) === outerKey)`)
        }
        for (const nested of ev.nestedLoops) {
          // See sibling comment above — `nested.key` may be null.
          const rawKey = nested.key ?? ''
          const innerKeyExpr = nested.paramBindings && nested.paramBindings.length > 0
            ? substituteLoopBindings(rawKey, nested.paramBindings, 'item')
            : rawKey.replace(new RegExp(`\\b${nested.param}\\b`, 'g'), 'item')
          const outerRef = hasBindings ? '__bfLoopItem' : loop.param
          ls.push(`      const ${nested.param} = ${outerRef} && ${nested.array}.find(item => String(${innerKeyExpr}) === innerKey${nested.depth})`)
        }
        const outerGuard = hasBindings ? '__bfLoopItem' : loop.param
        const allParams = [outerGuard, ...ev.nestedLoops.map(n => n.param)]
        if (loop.mapPreamble) ls.push(`      ${loop.mapPreamble}`)
        ls.push(`      if (${allParams.join(' && ')}) ${handlerCall}`)
      }
    })
  } else {
    // Non-keyed: find item by index in parent children
    emitLoopEventDelegation(lines, containerVar, childEvents, (ls, ev, handlerCall) => {
      ls.push(`      const li = ${varSlotId(ev.childSlotId)}El.closest('li, [bf-i]')`)
      ls.push(`      if (li && li.parentElement) {`)
      ls.push(`        const idx = Array.from(li.parentElement.children).indexOf(li)`)
      if (hasBindings) {
        ls.push(`        const __bfLoopItem = ${loop.array}[idx]`)
        ls.push(`        if (__bfLoopItem) {`)
        ls.push(`          const ${loop.param} = __bfLoopItem`)
        if (loop.mapPreamble) ls.push(`          ${loop.mapPreamble}`)
        ls.push(`          ${handlerCall}`)
        ls.push(`        }`)
      } else {
        ls.push(`        const ${loop.param} = ${loop.array}[idx]`)
        if (loop.mapPreamble) ls.push(`        ${loop.mapPreamble}`)
        ls.push(`        if (${loop.param}) ${handlerCall}`)
      }
      ls.push(`      }`)
    })
  }
}

/** Per-inner-loop data for composite loop emission. */
interface DepthLevel {
  comps: (TopLevelLoop['nestedComponents'] & {})[number][]
  events: LoopChildEvent[]
  loopInfo: NestedLoop | null
}

/**
 * Build per-inner-loop grouping of components and events.
 * One DepthLevel entry per inner loop (not per depth), so sibling loops at the
 * same depth (e.g., reactions.map + replies.map) each get their own forEach block.
 */
function buildDepthLevels(
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

/** Nesting-level-separated data for composite loop emission. */
interface CompositeLoopContext {
  elem: TopLevelLoop
  /** Components and events at the outer level (depth 0) */
  outerComps: TopLevelLoop['nestedComponents'] & {}
  outerEvents: LoopChildEvent[]
  /** Components, events, and loop info grouped by depth (depth 1, 2, ...) */
  depthLevels: DepthLevel[]
}

/** Emit a single addEventListener call for a child event on a given element. */
function emitEventSetup(ls: string[], indent: string, elVar: string, ev: LoopChildEvent, loopParam?: string, loopParamBindings?: readonly LoopParamBinding[]): void {
  let handler = loopParam ? wrapLoopParamAsAccessor(ev.handler, loopParam, loopParamBindings) : ev.handler
  handler = wrapHandlerInBlock(handler)
  ls.push(`${indent}{ const __e = qsa(${elVar}, '[bf="${ev.childSlotId}"]'); if (__e) __e.addEventListener('${toDomEventName(ev.eventName)}', ${handler}) }`)
}

/** Build the component-finder CSS selector for SSR hydration initChild. */
function buildCompSelector(comp: { slotId?: string | null; name: string }): string {
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
function isTextOnlyConditional(node: { type: string; [k: string]: any }): boolean {
  if (node.type !== 'conditional') return false
  const checkNode = (n: { type: string; [k: string]: any }): boolean =>
    n.type === 'text' || n.type === 'expression' || (n.type === 'conditional' && isTextOnlyConditional(n))
  return checkNode(node.whenTrue) && checkNode(node.whenFalse)
}

function emitComponentAndEventSetup(
  ls: string[],
  indent: string,
  elVar: string,
  comps: CompositeLoopContext['outerComps'],
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
function emitCompositeRenderItemBody(ls: string[], indent: string, ctx: CompositeLoopContext): void {
  const param = ctx.elem.param
  const paramBindings = ctx.elem.paramBindings
  const wrap = (expr: string) => wrapLoopParamAsAccessor(expr, param, paramBindings)

  // Exclude components inside reactive conditionals — managed by insert()
  const condCompSlotIds = new Set<string>()
  for (const cond of ctx.elem.childConditionals ?? []) {
    for (const comp of [...cond.whenTrue.childComponents, ...cond.whenFalse.childComponents]) {
      if (comp.slotId) condCompSlotIds.add(comp.slotId)
    }
  }
  const filteredComps = condCompSlotIds.size > 0
    ? ctx.outerComps.filter(c => !c.slotId || !condCompSlotIds.has(c.slotId))
    : ctx.outerComps

  // Hoist mapPreamble before the SSR/CSR split so variables it declares
  // (e.g. `const f = arr.find(...)`) are accessible in both branches and in
  // any reactive attribute getters emitted after the if/else block.
  if (ctx.elem.mapPreamble) {
    ls.push(`${indent}${wrap(ctx.elem.mapPreamble)}`)
  }

  // Branch: SSR (existing element) vs CSR (create from template)
  ls.push(`${indent}let __el`)
  ls.push(`${indent}if (__existing) {`)
  ls.push(`${indent}  __el = __existing`)
  // SSR: initialize nested components via initChild
  emitComponentAndEventSetup(ls, `${indent}  `, '__el', filteredComps, ctx.outerEvents, 'ssr', param, paramBindings)
  // SSR: inner loop initialization
  emitInnerLoopSetup(ls, `${indent}  `, '__el', ctx.depthLevels, 'ssr', param, paramBindings)
  ls.push(`${indent}} else {`)
  // CSR: create element from template, replace placeholders with createComponent
  ls.push(`${indent}  const __tpl = document.createElement('template')`)
  // Template is already wrapped at generation time (irToPlaceholderTemplate with loopParams)
  ls.push(`${indent}  __tpl.innerHTML = \`${ctx.elem.template}\``)
  ls.push(`${indent}  __el = __tpl.content.firstElementChild.cloneNode(true)`)
  emitComponentAndEventSetup(ls, `${indent}  `, '__el', filteredComps, ctx.outerEvents, 'csr', param, paramBindings)
  // CSR: inner loop initialization
  emitInnerLoopSetup(ls, `${indent}  `, '__el', ctx.depthLevels, 'csr', param, paramBindings)
  ls.push(`${indent}}`)

  const reactiveAttrs = ctx.elem.childReactiveAttrs ?? []
  const reactiveTexts = ctx.elem.childReactiveTexts ?? []
  const reactiveConditionals = ctx.elem.childConditionals ?? []
  if (reactiveAttrs.length > 0 || reactiveTexts.length > 0 || reactiveConditionals.length > 0) {
    emitLoopChildReactiveEffects(ls, indent, '__el', reactiveAttrs, reactiveTexts, reactiveConditionals, param, paramBindings)
  }

  ls.push(`${indent}return __el`)
}

/**
 * Emit inner loop forEach + component/event setup for CSR and SSR.
 * Handles sibling loops at the same depth (emitted sequentially) and
 * nested loops at increasing depth (emitted inside their parent's forEach).
 * Levels are ordered by DFS walk, so child levels immediately follow their parent.
 */
function emitInnerLoopSetup(
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

    if (inner.refsOuterParam && inner.template && outerLoopParam) {
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
        const wrappedComps = level.comps.map(comp => {
          const wrapped = {
            ...comp,
            props: comp.props.map(p => p.isLiteral ? p : ({ ...p, value: wrapInner(p.value) })),
            children: comp.children?.map(wrapIRNode),
          }
          if (comp.name === 'Select') console.error('[DEBUG-WRAP] before:', comp.children?.length, 'after:', wrapped.children?.length)
          return wrapped
        })
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
      // Recurse for child levels
      if (childLevels.length > 0) {
        emitInnerLoopSetup(ls, `${indent}  `, `__innerEl${uid}`, childLevels, mode, outerLoopParam, outerLoopParamBindings)
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
      // Recurse for child levels (nested deeper loops)
      if (childLevels.length > 0) {
        emitInnerLoopSetup(ls, `${indent}  `, `__innerEl${uid}`, childLevels, mode, outerLoopParam, outerLoopParamBindings)
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
  keyFn: string,
): void {
  const vLoop = varSlotId(elem.slotId)
  const chainedExpr = buildChainedArrayExpr(elem)
  const indexParam = elem.index || '__idx'

  const nestedComps = elem.nestedComponents!
  const innerLoops = elem.innerLoops ?? []

  const depthLevels = buildDepthLevels(innerLoops, nestedComps, elem.childEvents)

  const ctx: CompositeLoopContext = {
    elem,
    outerComps: nestedComps.filter(c => !c.loopDepth || c.loopDepth === 0),
    outerEvents: elem.childEvents.filter(ev => ev.nestedLoops.length === 0),
    depthLevels,
  }

  const { head: pHead, unwrap: pUnwrap } = destructureLoopParam(elem.param, elem.paramBindings)
  lines.push(`  mapArray(() => ${chainedExpr}, _${vLoop}, ${keyFn}, (${pHead}, ${indexParam}, __existing) => {`)
  if (pUnwrap) {
    lines.push(`    ${pUnwrap}`)
  }
  emitCompositeRenderItemBody(lines, '    ', ctx)
  lines.push(`  })`)
}

/**
 * Callback that emits the item-lookup lines inside a loop event delegation handler.
 * Called once per event after target.closest() matched.
 */
type ItemLookupEmitter = (
  lines: string[],
  ev: LoopChildEvent,
  handlerCall: string,
  containerVar: string,
) => void

/** Non-bubbling events that require addEventListener with capture for delegation. */
const NON_BUBBLING_EVENTS = new Set([
  'blur', 'focus', 'load', 'unload',
  'mouseenter', 'mouseleave',
  'pointerenter', 'pointerleave',
])

/**
 * Emit event delegation for child events inside a loop (static or dynamic).
 * The shared shell (event grouping, closest matching, handler call construction)
 * is handled here; the strategy-specific item-lookup is injected via callback.
 */
function emitLoopEventDelegation(
  lines: string[],
  containerVar: string,
  childEvents: LoopChildEvent[],
  emitItemLookup: ItemLookupEmitter,
): void {
  const eventsByName = new Map<string, LoopChildEvent[]>()
  for (const ev of childEvents) {
    if (!eventsByName.has(ev.eventName)) {
      eventsByName.set(ev.eventName, [])
    }
    eventsByName.get(ev.eventName)!.push(ev)
  }

  for (const [eventName, events] of eventsByName) {
    // Sort deepest-first so child elements are checked before parents (#774)
    events.sort((a, b) => b.domDepth - a.domDepth)
    const useCapture = NON_BUBBLING_EVENTS.has(eventName)
    if (useCapture) {
      lines.push(`  if (${containerVar}) ${containerVar}.addEventListener('${eventName}', (e) => {`)
    } else {
      lines.push(`  if (${containerVar}) ${containerVar}.addEventListener('${toDomEventName(eventName)}', (e) => {`)
    }
    lines.push(`    const target = e.target`)
    for (const ev of events) {
      const childVar = varSlotId(ev.childSlotId)
      lines.push(`    const ${childVar}El = target.closest('[bf="${ev.childSlotId}"]')`)
      lines.push(`    if (${childVar}El) {`)
      const handlerCall = `(${ev.handler.trim()})(e)`
      emitItemLookup(lines, ev, handlerCall, containerVar)
      lines.push(`      return`)
      lines.push(`    }`)
    }
    if (useCapture) {
      lines.push(`  }, true)`)
    } else {
      lines.push(`  })`)
    }
    lines.push('')
  }
}
