/**
 * Control flow emission: conditionals and loops.
 * Handles insert() for reactive conditionals, reconcileElements for dynamic loops,
 * and event delegation within loop containers.
 */

import type { ClientJsContext, ConditionalBranchEvent, ConditionalBranchRef, ConditionalBranchChildComponent, ConditionalBranchTextEffect, ConditionalBranchLoop, ConditionalBranchConditional, LoopChildEvent, LoopElement, NestedLoopInfo } from './types'
import type { IRLoopChildComponent } from '../types'
import { toDomEventName, wrapHandlerInBlock, varSlotId, buildChainedArrayExpr, quotePropName, DATA_KEY, DATA_KEY_PREFIX, DATA_BF_PH, keyAttrName, wrapLoopParamAsAccessor, exprReferencesIdent } from './utils'
import { addCondAttrToTemplate, irChildrenToJsExpr } from './html-template'
import { emitAttrUpdate } from './emit-reactive'

/**
 * Emit find() + event binding + ref callbacks + child component inits for a conditional branch.
 * Used by both emitConditionalUpdates and emitClientOnlyConditionals.
 */
function emitBranchBindings(
  lines: string[],
  events: ConditionalBranchEvent[],
  refs: ConditionalBranchRef[],
  childComponents: ConditionalBranchChildComponent[],
  eventNameFn: (eventName: string) => string,
  textEffects: ConditionalBranchTextEffect[] = [],
  branchLoops: ConditionalBranchLoop[] = [],
  branchConditionals: ConditionalBranchConditional[] = []
): void {
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
    // SSR templates use data-key-1 for loops inside conditionals (depth 1 in the
    // inline template), but reconcileElements uses data-key (depth 0 for independent loops).
    // Rename SSR attributes on hydration so reconcileElements can find them.
    for (const loop of branchLoops) {
      const cv = varSlotId(loop.containerSlotId)
      lines.push(`      const [__loop_${cv}] = $(__branchScope, '${loop.containerSlotId}')`)

      if (loop.useElementReconciliation && loop.nestedComponents?.length) {
        // Composite loop: items contain child components — use createComponent in renderItem.
        // Do NOT rename data-key-1 → data-key here: the hydration guard inside the
        // disposable effect checks !hasAttribute('data-key') to detect template-generated
        // elements and initialize child components via initChild. Premature rename would
        // skip hydration, leaving components uninitialized.
        emitCompositeBranchLoop(lines, loop, cv)
      } else {
        // Simple loop: rename SSR data-key-1 → data-key for mapArray compatibility.
        // Safe for simple loops (no child components to initialize).
        lines.push(`      if (__loop_${cv}) getLoopChildren(__loop_${cv}).forEach(__el => { if (__el.hasAttribute('${DATA_KEY_PREFIX}1') && !__el.hasAttribute('${DATA_KEY}')) { __el.setAttribute('${DATA_KEY}', __el.getAttribute('${DATA_KEY_PREFIX}1')); __el.removeAttribute('${DATA_KEY_PREFIX}1') } })`)
        const keyFn = loop.key
          ? `(${loop.param}${loop.index ? `, ${loop.index}` : ''}) => String(${loop.key})`
          : 'null'
        const indexParam = loop.index || '__idx'
        if (loop.mapPreamble) {
          lines.push(`      if (__loop_${cv}) mapArray(() => ${loop.array}, __loop_${cv}, ${keyFn}, (${loop.param}, ${indexParam}) => { ${loop.mapPreamble}; const __tpl = document.createElement('template'); __tpl.innerHTML = \`${loop.template}\`; return __tpl.content.firstElementChild.cloneNode(true) })`)
        } else {
          lines.push(`      if (__loop_${cv}) mapArray(() => ${loop.array}, __loop_${cv}, ${keyFn}, (${loop.param}, ${indexParam}) => { const __tpl = document.createElement('template'); __tpl.innerHTML = \`${loop.template}\`; return __tpl.content.firstElementChild.cloneNode(true) })`)
        }
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
  elem: ConditionalBranchConditional,
  eventNameFn: (eventName: string) => string,
): void {
  const whenTrueWithCond = addCondAttrToTemplate(elem.whenTrueHtml, elem.slotId)
  const whenFalseWithCond = addCondAttrToTemplate(elem.whenFalseHtml, elem.slotId)

  lines.push(`      insert(__branchScope, '${elem.slotId}', () => ${elem.condition}, {`)
  lines.push(`        template: () => \`${whenTrueWithCond}\`,`)
  lines.push(`        bindEvents: (__branchScope) => {`)
  emitBranchBindings(lines, elem.whenTrueEvents, elem.whenTrueRefs, elem.whenTrueChildComponents, eventNameFn, elem.whenTrueTextEffects, elem.whenTrueLoops, elem.whenTrueConditionals)
  lines.push(`        }`)
  lines.push(`      }, {`)
  lines.push(`        template: () => \`${whenFalseWithCond}\`,`)
  lines.push(`        bindEvents: (__branchScope) => {`)
  emitBranchBindings(lines, elem.whenFalseEvents, elem.whenFalseRefs, elem.whenFalseChildComponents, eventNameFn, elem.whenFalseTextEffects, elem.whenFalseLoops, elem.whenFalseConditionals)
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
  loop: ConditionalBranchLoop,
  cv: string,
): void {
  const nestedComps = loop.nestedComponents!
  const innerLoops = loop.innerLoops ?? []
  const childEvents = loop.childEvents ?? []
  const indexParam = loop.index || '__idx'

  const depthLevels = buildDepthLevels(innerLoops, nestedComps, childEvents)

  const outerComps = nestedComps.filter(c => !c.loopDepth || c.loopDepth === 0)
  const outerEvents = childEvents.filter(ev => ev.nestedLoops.length === 0)

  // Build a partial LoopElement-compatible object for CompositeLoopContext
  const pseudoElem = {
    param: loop.param,
    template: loop.template,
    mapPreamble: loop.mapPreamble ?? undefined,
    childReactiveTexts: loop.childReactiveTexts ?? [],
    childReactiveAttrs: loop.childReactiveAttrs ?? [],
    childConditionals: loop.childConditionals ?? [],
  } as unknown as LoopElement

  const ctx: CompositeLoopContext = {
    elem: pseudoElem,
    outerComps,
    outerEvents,
    depthLevels,
  }

  const keyFn = loop.key
    ? `(${loop.param}${loop.index ? `, ${loop.index}` : ''}) => String(${loop.key})`
    : 'null'

  // Wrap everything in a disposable effect for branch cleanup
  // Clear template-generated children so mapArray creates fresh elements
  // with properly initialized components via createComponent in renderItem.
  lines.push(`      if (__loop_${cv}) getLoopChildren(__loop_${cv}).forEach(__el => __el.remove())`)
  lines.push(`      if (__loop_${cv}) mapArray(() => ${loop.array}, __loop_${cv}, ${keyFn}, (${loop.param}, ${indexParam}, __existing) => {`)
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
    emitBranchBindings(lines, elem.whenTrueEvents, elem.whenTrueRefs, elem.whenTrueChildComponents, toDomEventName, elem.whenTrueTextEffects, elem.whenTrueLoops, elem.whenTrueConditionals)
    lines.push(`    }`)
    lines.push(`  }, {`)
    lines.push(`    template: () => \`${whenFalseWithCond}\`,`)
    lines.push(`    bindEvents: (__branchScope) => {`)
    emitBranchBindings(lines, elem.whenFalseEvents, elem.whenFalseRefs, elem.whenFalseChildComponents, toDomEventName, elem.whenFalseTextEffects, elem.whenFalseLoops, elem.whenFalseConditionals)
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
    emitBranchBindings(lines, elem.whenTrueEvents, elem.whenTrueRefs, elem.whenTrueChildComponents, rawEventName, elem.whenTrueTextEffects, elem.whenTrueLoops, elem.whenTrueConditionals)
    lines.push(`    }`)
    lines.push(`  }, {`)
    lines.push(`    template: () => \`${whenFalseWithCond}\`,`)
    lines.push(`    bindEvents: (__branchScope) => {`)
    emitBranchBindings(lines, elem.whenFalseEvents, elem.whenFalseRefs, elem.whenFalseChildComponents, rawEventName, elem.whenFalseTextEffects, elem.whenFalseLoops, elem.whenFalseConditionals)
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
  components: Array<{ name: string; slotId: string | null; props: import('../types').IRProp[] }>,
  loopParam?: string,
): void {
  const wrap = loopParam ? (expr: string) => wrapLoopParamAsAccessor(expr, loopParam) : (expr: string) => expr
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
    const propsExpr = propsEntries.length > 0 ? `{ ${propsEntries.join(', ')} }` : '{}'
    lines.push(`${indent}{ const __c = __branchScope.querySelector('${selector}'); if (__c) initChild('${comp.name}', __c, ${propsExpr}) }`)
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
  innerLoops: import('./types').NestedLoopInfo[] | undefined,
  outerLoopParam?: string,
): void {
  if (!innerLoops || !outerLoopParam) return
  const wrapOuter = (expr: string) => wrapLoopParamAsAccessor(expr, outerLoopParam)

  for (let i = 0; i < innerLoops.length; i++) {
    const inner = innerLoops[i]
    if (!inner.refsOuterParam || !inner.itemTemplate) continue

    const uid = `br_${i}`
    const arrayExpr = wrapOuter(inner.array)
    const keyFn = inner.key
      ? `(${inner.param}) => String(${inner.key})`
      : 'null'
    const wrapBoth = (expr: string) => wrapLoopParamAsAccessor(wrapOuter(expr), inner.param)
    // Template is already wrapped at generation time (irToPlaceholderTemplate with loopParams)
    const wrappedTemplate = inner.itemTemplate
    const containerSelector = inner.containerSlotId ? `'[bf="${inner.containerSlotId}"]'` : 'null'

    lines.push(`${indent}{ const __bic${uid} = ${containerSelector !== 'null' ? `${scopeVar}.querySelector(${containerSelector})` : scopeVar}`)
    lines.push(`${indent}if (__bic${uid}) mapArray(() => ${arrayExpr} || [], __bic${uid}, ${keyFn}, (${inner.param}, __bidx${uid}, __existing) => {`)
    lines.push(`${indent}  const __bel${uid} = __existing ?? (() => { const __t = document.createElement('template'); __t.innerHTML = \`${wrappedTemplate}\`; return __t.content.firstElementChild.cloneNode(true) })()`)
    if (inner.key) {
      const wrappedKey = wrapLoopParamAsAccessor(inner.key, inner.param)
      lines.push(`${indent}  __bel${uid}.setAttribute('${keyAttrName(1)}', String(${wrappedKey}))`)
    }
    // Components and events inside inner loop items
    const wrapInner = (expr: string) => wrapLoopParamAsAccessor(expr, inner.param)
    const comps = (inner.childComponents ?? []).map(comp => ({
      ...comp,
      props: comp.props.map(p => p.isLiteral ? p : ({ ...p, value: wrapInner(p.value) })),
    }))
    const events = (inner.childEvents ?? []).map(ev => ({
      ...ev,
      handler: wrapInner(ev.handler),
    }))
    if (comps.length > 0 || events.length > 0) {
      lines.push(`${indent}  if (!__existing) {`)
      emitComponentAndEventSetup(lines, `${indent}    `, `__bel${uid}`, comps, events, 'csr', outerLoopParam)
      lines.push(`${indent}  } else {`)
      emitComponentAndEventSetup(lines, `${indent}    `, `__bel${uid}`, comps, events, 'ssr', outerLoopParam)
      lines.push(`${indent}  }`)
    }
    // Reactive text effects for inner loop items
    if (inner.reactiveTexts && inner.reactiveTexts.length > 0) {
      for (const text of inner.reactiveTexts) {
        const wrappedExpr = wrapBoth(text.expression)
        lines.push(`${indent}  { const [__rt] = $t(__bel${uid}, '${text.slotId}')`)
        lines.push(`${indent}  if (__rt) createEffect(() => { __rt.textContent = String(${wrappedExpr}) }) }`)
      }
    }
    lines.push(`${indent}  return __bel${uid}`)
    lines.push(`${indent}}) }`)
  }
}

function emitLoopChildReactiveEffects(
  lines: string[],
  indent: string,
  elVar: string,
  attrs: LoopElement['childReactiveAttrs'],
  texts: LoopElement['childReactiveTexts'],
  conditionals?: LoopElement['childConditionals'],
  loopParam?: string,
): void {
  const wrap = loopParam ? (expr: string) => wrapLoopParamAsAccessor(expr, loopParam) : (expr: string) => expr
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

  // Reactive text content effects
  for (const text of texts) {
    const varName = `__rt_${varSlotId(text.slotId)}`
    lines.push(`${indent}{ const [${varName}] = $t(${elVar}, '${text.slotId}')`)
    lines.push(`${indent}if (${varName}) createEffect(() => { ${varName}.textContent = String(${wrap(text.expression)}) }) }`)
  }

  // Reactive conditional effects
  if (conditionals) {
    for (const cond of conditionals) {
      const whenTrueWithCond = addCondAttrToTemplate(wrap(cond.whenTrueHtml), cond.slotId)
      const whenFalseWithCond = addCondAttrToTemplate(wrap(cond.whenFalseHtml), cond.slotId)
      lines.push(`${indent}insert(${elVar}, '${cond.slotId}', () => ${wrap(cond.condition)}, {`)
      lines.push(`${indent}  template: () => \`${whenTrueWithCond}\`,`)
      lines.push(`${indent}  bindEvents: (__branchScope) => {`)
      emitBranchChildComponentInits(lines, `${indent}    `, cond.whenTrueComponents, loopParam)
      emitBranchInnerLoops(lines, `${indent}    `, '__branchScope', cond.whenTrueInnerLoops, loopParam)
      lines.push(`${indent}  }`)
      lines.push(`${indent}}, {`)
      lines.push(`${indent}  template: () => \`${whenFalseWithCond}\`,`)
      lines.push(`${indent}  bindEvents: (__branchScope) => {`)
      emitBranchChildComponentInits(lines, `${indent}    `, cond.whenFalseComponents, loopParam)
      emitBranchInnerLoops(lines, `${indent}    `, '__branchScope', cond.whenFalseInnerLoops, loopParam)
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
function emitStaticArrayUpdates(lines: string[], elem: LoopElement): void {
  // Static array initChild calls are deferred to emitStaticArrayChildInits()
  // so that parent context providers (provideContext) run first.

  // Reactive attribute effects for plain elements in static arrays.
  if (!elem.childComponent && elem.childReactiveAttrs.length > 0) {
    const v = varSlotId(elem.slotId)
    lines.push(`  // Reactive attributes in static array children`)
    lines.push(`  if (_${v}) {`)
    const indexParam = elem.index || '__idx'
    lines.push(`    ${elem.array}.forEach((${elem.param}, ${indexParam}) => {`)
    lines.push(`      const __iterEl = _${v}.children[${indexParam}]`)
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

  // Event delegation for plain elements in static arrays (#537).
  // Static arrays have no data-key/bf-i markers, so walk up from target to
  // the container's direct child and use indexOf for index lookup.
  if (!elem.childComponent && elem.childEvents.length > 0) {
    const v = varSlotId(elem.slotId)
    emitLoopEventDelegation(lines, `_${v}`, elem.childEvents, (ls, ev, handlerCall, cVar) => {
      ls.push(`      let __el = ${varSlotId(ev.childSlotId)}El`)
      ls.push(`      while (__el.parentElement && __el.parentElement !== ${cVar}) __el = __el.parentElement`)
      ls.push(`      if (__el.parentElement === ${cVar}) {`)
      ls.push(`        const __idx = Array.from(${cVar}.children).indexOf(__el)`)
      ls.push(`        const ${elem.param} = ${elem.array}[__idx]`)
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
function emitDynamicLoopUpdates(lines: string[], elem: LoopElement): void {
  const keyFn = elem.key
    ? `(${elem.param}${elem.index ? `, ${elem.index}` : ''}) => String(${elem.key})`
    : 'null'

  if (elem.useElementReconciliation && elem.nestedComponents?.length) {
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
): string {
  const wrap = loopParam ? (expr: string) => wrapLoopParamAsAccessor(expr, loopParam) : (expr: string) => expr
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
    entries.push(`get children() { return ${wrap(childrenExpr)} }`)
  }
  return entries.length > 0 ? `{ ${entries.join(', ')} }` : '{}'
}

/** Emit mapArray for a loop whose body is a single child component. */
function emitComponentLoopReconciliation(lines: string[], elem: LoopElement, keyFn: string): void {
  const { name } = elem.childComponent!
  const vLoop = varSlotId(elem.slotId)
  const propsExpr = buildComponentPropsExpr(elem.childComponent!, elem.param)
  const keyExpr = wrapLoopParamAsAccessor(elem.key || '__idx', elem.param)
  const indexParam = elem.index || '__idx'
  const chainedExpr = buildChainedArrayExpr(elem)
  const nestedComps = elem.nestedComponents ?? []

  lines.push(`  mapArray(() => ${chainedExpr}, _${vLoop}, ${keyFn}, (${elem.param}, ${indexParam}, __existing) => {`)
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
        ? comp.children.every(c => c.type === 'expression' || c.type === 'text')
        : false
      const rawChildrenExpr = isTextOnly ? irChildrenToJsExpr(comp.children!) : null
      const childrenRefsLoop = rawChildrenExpr != null && exprReferencesIdent(rawChildrenExpr, elem.param)
      if (childrenRefsLoop) {
        const wrappedChildren = wrapLoopParamAsAccessor(rawChildrenExpr, elem.param)
        lines.push(`      { const __c = __existing.querySelector('${selector}'); if (__c) { initChild('${comp.name}', __c, ${nestedPropsExpr}); createEffect(() => { const __v = ${wrappedChildren}; __c.textContent = Array.isArray(__v) ? __v.join('') : String(__v ?? '') }) } }`)
      } else {
        lines.push(`      { const __c = __existing.querySelector('${selector}'); if (__c) initChild('${comp.name}', __c, ${nestedPropsExpr}) }`)
      }
    }
    lines.push(`      return __existing`)
    lines.push(`    }`)
    lines.push(`    return createComponent('${name}', ${propsExpr}, ${keyExpr})`)
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
  elem: LoopElement,
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
function emitPlainElementLoopReconciliation(lines: string[], elem: LoopElement, keyFn: string): void {
  const vLoop = varSlotId(elem.slotId)
  const chainedExpr = buildChainedArrayExpr(elem)
  const indexParam = elem.index || '__idx'
  const wrap = (expr: string) => wrapLoopParamAsAccessor(expr, elem.param)

  const hasReactiveEffects = elem.childReactiveAttrs.length > 0 || elem.childReactiveTexts.length > 0

  if (!hasReactiveEffects) {
    // Simple case: no reactive effects
    // Template is already wrapped at generation time (irToPlaceholderTemplate with loopParams)
    const preamble = elem.mapPreamble ? `${wrap(elem.mapPreamble)}; ` : ''
    lines.push(`  mapArray(() => ${chainedExpr}, _${vLoop}, ${keyFn}, (${elem.param}, ${indexParam}, __existing) => { ${preamble}if (__existing) return __existing; const __tpl = document.createElement('template'); __tpl.innerHTML = \`${elem.template}\`; return __tpl.content.firstElementChild.cloneNode(true) })`)
  } else {
    // Multi-line renderItem with fine-grained effects (shared for CSR and SSR)
    lines.push(`  mapArray(() => ${chainedExpr}, _${vLoop}, ${keyFn}, (${elem.param}, ${indexParam}, __existing) => {`)
    if (elem.mapPreamble) {
      lines.push(`    ${wrap(elem.mapPreamble)}`)
    }
    // Template is already wrapped at generation time (irToPlaceholderTemplate with loopParams)
    lines.push(`    const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = \`${elem.template}\`; return __tpl.content.firstElementChild.cloneNode(true) })()`)
    emitLoopChildReactiveEffects(lines, '    ', '__el', elem.childReactiveAttrs, elem.childReactiveTexts, elem.childConditionals, elem.param)
    lines.push(`    return __el`)
    lines.push(`  })`)
  }
}

/** Emit event delegation for dynamic (non-static) loop child events. */
function emitDynamicLoopEventDelegation(lines: string[], elem: LoopElement): void {
  const vLoop = varSlotId(elem.slotId)

  if (elem.key) {
    // Dynamic keyed: find item by data-key attribute
    const keyWithItem = elem.key.replace(new RegExp(`\\b${elem.param}\\b`, 'g'), 'item')
    emitLoopEventDelegation(lines, `_${vLoop}`, elem.childEvents, (ls, ev, handlerCall) => {
      if (ev.nestedLoops.length === 0) {
        // Direct child of outer loop — single-level lookup
        ls.push(`      const li = ${varSlotId(ev.childSlotId)}El.closest('[${DATA_KEY}]')`)
        ls.push(`      if (li) {`)
        ls.push(`        const key = li.getAttribute('${DATA_KEY}')`)
        ls.push(`        const ${elem.param} = ${elem.array}.find(item => String(${keyWithItem}) === key)`)
        ls.push(`        if (${elem.param}) ${handlerCall}`)
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
        // Resolve outer loop variable
        ls.push(`      const ${elem.param} = ${elem.array}.find(item => String(${keyWithItem}) === outerKey)`)
        // Resolve inner loop variables via the outer param's nested array
        for (const nested of ev.nestedLoops) {
          const innerKeyExpr = nested.key.replace(new RegExp(`\\b${nested.param}\\b`, 'g'), 'item')
          ls.push(`      const ${nested.param} = ${elem.param} && ${nested.array}.find(item => String(${innerKeyExpr}) === innerKey${nested.depth})`)
        }
        // Guard all resolved variables
        const allParams = [elem.param, ...ev.nestedLoops.map(n => n.param)]
        ls.push(`      if (${allParams.join(' && ')}) ${handlerCall}`)
      }
    })
  } else {
    // Dynamic non-keyed: find item by index in parent children
    emitLoopEventDelegation(lines, `_${vLoop}`, elem.childEvents, (ls, ev, handlerCall) => {
      ls.push(`      const li = ${varSlotId(ev.childSlotId)}El.closest('li, [bf-i]')`)
      ls.push(`      if (li && li.parentElement) {`)
      ls.push(`        const idx = Array.from(li.parentElement.children).indexOf(li)`)
      ls.push(`        const ${elem.param} = ${elem.array}[idx]`)
      ls.push(`        if (${elem.param}) ${handlerCall}`)
      ls.push(`      }`)
    })
  }
}

/** Per-inner-loop data for composite loop emission. */
interface DepthLevel {
  comps: (LoopElement['nestedComponents'] & {})[number][]
  events: LoopChildEvent[]
  loopInfo: { array: string; param: string; key: string; depth: number; containerSlotId?: string | null; itemTemplate?: string; refsOuterParam?: boolean; reactiveTexts?: Array<{ slotId: string; expression: string }>; insideConditional?: boolean } | null
}

/**
 * Build per-inner-loop grouping of components and events.
 * One DepthLevel entry per inner loop (not per depth), so sibling loops at the
 * same depth (e.g., reactions.map + replies.map) each get their own forEach block.
 */
function buildDepthLevels(
  innerLoops: NestedLoopInfo[],
  nestedComps: IRLoopChildComponent[],
  childEvents: LoopChildEvent[],
): DepthLevel[] {
  return innerLoops.map(loop => ({
    comps: nestedComps.filter(c =>
      (c.loopDepth ?? 0) === loop.depth && c.innerLoopArray === loop.array
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
  elem: LoopElement
  /** Components and events at the outer level (depth 0) */
  outerComps: LoopElement['nestedComponents'] & {}
  outerEvents: LoopChildEvent[]
  /** Components, events, and loop info grouped by depth (depth 1, 2, ...) */
  depthLevels: DepthLevel[]
}

/** Emit a single addEventListener call for a child event on a given element. */
function emitEventSetup(ls: string[], indent: string, elVar: string, ev: LoopChildEvent, loopParam?: string): void {
  let handler = ev.handler.trim().startsWith('(') || ev.handler.trim().startsWith('function')
    ? `(${ev.handler})(e)`
    : ev.handler
  if (loopParam) handler = wrapLoopParamAsAccessor(handler, loopParam)
  ls.push(`${indent}{ const __e = qsa(${elVar}, '[bf="${ev.childSlotId}"]'); if (__e) __e.addEventListener('${toDomEventName(ev.eventName)}', (e) => { ${handler} }) }`)
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
function emitComponentAndEventSetup(
  ls: string[],
  indent: string,
  elVar: string,
  comps: CompositeLoopContext['outerComps'],
  events: LoopChildEvent[],
  mode: 'csr' | 'ssr',
  loopParam?: string,
): void {
  const wrap = loopParam ? (expr: string) => wrapLoopParamAsAccessor(expr, loopParam) : (expr: string) => expr
  for (const comp of comps) {
    const propsExpr = buildComponentPropsExpr(comp, loopParam)
    if (mode === 'csr') {
      const phId = comp.slotId || comp.name
      const keyProp = comp.props.find(p => p.name === 'key')
      const keyArg = keyProp ? `, ${wrap(keyProp.value)}` : ''
      ls.push(`${indent}{ const __ph = ${elVar}.querySelector('[${DATA_BF_PH}="${phId}"]'); if (__ph) __ph.replaceWith(createComponent('${comp.name}', ${propsExpr}${keyArg})) }`)
    } else {
      const selector = buildCompSelector(comp)
      ls.push(`${indent}{ const __c = ${elVar}.querySelector('${selector}'); if (__c) initChild('${comp.name}', __c, ${propsExpr}) }`)
    }
  }
  for (const ev of events) {
    emitEventSetup(ls, indent, elVar, ev, loopParam)
  }
}

/**
 * Emit the unified renderItem function body for composite loops.
 * Handles both CSR (create from template) and SSR (initialize existing element).
 * Inner loops, events, and reactive effects are shared between both paths.
 */
function emitCompositeRenderItemBody(ls: string[], indent: string, ctx: CompositeLoopContext): void {
  const param = ctx.elem.param
  const wrap = (expr: string) => wrapLoopParamAsAccessor(expr, param)

  // Exclude components inside reactive conditionals — managed by insert()
  const condCompSlotIds = new Set<string>()
  for (const cond of ctx.elem.childConditionals ?? []) {
    for (const comp of [...cond.whenTrueComponents, ...cond.whenFalseComponents]) {
      if (comp.slotId) condCompSlotIds.add(comp.slotId)
    }
  }
  const filteredComps = condCompSlotIds.size > 0
    ? ctx.outerComps.filter(c => !c.slotId || !condCompSlotIds.has(c.slotId))
    : ctx.outerComps

  // Branch: SSR (existing element) vs CSR (create from template)
  ls.push(`${indent}let __el`)
  ls.push(`${indent}if (__existing) {`)
  ls.push(`${indent}  __el = __existing`)
  // SSR: initialize nested components via initChild
  emitComponentAndEventSetup(ls, `${indent}  `, '__el', filteredComps, ctx.outerEvents, 'ssr', param)
  // SSR: inner loop initialization
  emitInnerLoopSetup(ls, `${indent}  `, '__el', ctx.depthLevels, 'ssr', param)
  ls.push(`${indent}} else {`)
  // CSR: create element from template, replace placeholders with createComponent
  if (ctx.elem.mapPreamble) {
    ls.push(`${indent}  ${wrap(ctx.elem.mapPreamble)}`)
  }
  ls.push(`${indent}  const __tpl = document.createElement('template')`)
  // Template is already wrapped at generation time (irToPlaceholderTemplate with loopParams)
  ls.push(`${indent}  __tpl.innerHTML = \`${ctx.elem.template}\``)
  ls.push(`${indent}  __el = __tpl.content.firstElementChild.cloneNode(true)`)
  emitComponentAndEventSetup(ls, `${indent}  `, '__el', filteredComps, ctx.outerEvents, 'csr', param)
  // CSR: inner loop initialization
  emitInnerLoopSetup(ls, `${indent}  `, '__el', ctx.depthLevels, 'csr', param)
  ls.push(`${indent}}`)

  const reactiveAttrs = ctx.elem.childReactiveAttrs ?? []
  const reactiveTexts = ctx.elem.childReactiveTexts ?? []
  const reactiveConditionals = ctx.elem.childConditionals ?? []
  if (reactiveAttrs.length > 0 || reactiveTexts.length > 0 || reactiveConditionals.length > 0) {
    emitLoopChildReactiveEffects(ls, indent, '__el', reactiveAttrs, reactiveTexts, reactiveConditionals, param)
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
): void {
  const wrapOuter = outerLoopParam
    ? (expr: string) => wrapLoopParamAsAccessor(expr, outerLoopParam) : (expr: string) => expr
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

    if (inner.refsOuterParam && inner.itemTemplate && outerLoopParam) {
      // Reactive inner loop: use mapArray for proper add/remove/update
      // Key function receives plain item value (not accessor) per mapArray contract
      const keyFn = inner.key
        ? `(${inner.param}) => String(${inner.key})`
        : 'null'
      const wrapBoth = (expr: string) => wrapLoopParamAsAccessor(wrapOuter(expr), inner.param)
      // Template is already wrapped at generation time (irToPlaceholderTemplate with loopParams)
      const wrappedTemplate = inner.itemTemplate!
      ls.push(`${indent}// Reactive inner loop: ${inner.array}`)
      ls.push(`${indent}{ const __ic${uid} = ${containerSelector !== 'null' ? `${parentElVar}.querySelector(${containerSelector})` : parentElVar}`)
      ls.push(`${indent}if (__ic${uid}) mapArray(() => ${arrayExpr} || [], __ic${uid}, ${keyFn}, (${inner.param}, __innerIdx${uid}, __existing) => {`)
      // SSR/CSR branch
      ls.push(`${indent}  const __innerEl${uid} = __existing ?? (() => { const __t = document.createElement('template'); __t.innerHTML = \`${wrappedTemplate}\`; return __t.content.firstElementChild.cloneNode(true) })()`)
      if (inner.key) {
        // Inside renderItem, inner.param is an accessor
        const wrappedKey = wrapLoopParamAsAccessor(inner.key, inner.param)
        ls.push(`${indent}  __innerEl${uid}.setAttribute('${keyAttrName(inner.depth)}', String(${wrappedKey}))`)
      }
      // Set up components and events — wrap inner loop param as accessor
      if (level.comps.length > 0 || level.events.length > 0) {
        // Pre-wrap both component props and event handlers with inner loop param
        const wrapInner = (expr: string) => wrapLoopParamAsAccessor(expr, inner.param)
        const wrappedComps = level.comps.map(comp => ({
          ...comp,
          props: comp.props.map(p => p.isLiteral ? p : ({ ...p, value: wrapInner(p.value) })),
          children: comp.children?.map(c => c.type === 'expression' && c.expr
            ? { ...c, expr: wrapInner(c.expr) } : c),
        }))
        const wrappedEvents = level.events.map(ev => ({
          ...ev,
          handler: wrapInner(ev.handler),
        }))
        ls.push(`${indent}  if (!__existing) {`)
        emitComponentAndEventSetup(ls, `${indent}    `, `__innerEl${uid}`, wrappedComps, wrappedEvents, 'csr', outerLoopParam)
        ls.push(`${indent}  } else {`)
        emitComponentAndEventSetup(ls, `${indent}    `, `__innerEl${uid}`, wrappedComps, wrappedEvents, 'ssr', outerLoopParam)
        ls.push(`${indent}  }`)
      }
      // Recurse for child levels
      if (childLevels.length > 0) {
        emitInnerLoopSetup(ls, `${indent}  `, `__innerEl${uid}`, childLevels, mode, outerLoopParam)
      }
      // Reactive text effects for inner loop items
      if (inner.reactiveTexts && inner.reactiveTexts.length > 0) {
        for (const text of inner.reactiveTexts) {
          const wrappedExpr = wrapLoopParamAsAccessor(wrapOuter(text.expression), inner.param)
          ls.push(`${indent}  { const [__rt] = $t(__innerEl${uid}, '${text.slotId}')`)
          ls.push(`${indent}  if (__rt) createEffect(() => { __rt.textContent = String(${wrappedExpr}) }) }`)
        }
      }
      ls.push(`${indent}  return __innerEl${uid}`)
      ls.push(`${indent}}) }`)
    } else {
      // Static inner loop: use forEach for initial setup only
      ls.push(`${indent}// Initialize ${inner.array} loop components and events`)
      ls.push(`${indent}{ const __ic${uid} = ${containerSelector !== 'null' ? `${parentElVar}.querySelector(${containerSelector})` : parentElVar}`)
      // Guard: inner loop array may be undefined when inside a conditional branch
      ls.push(`${indent}if (__ic${uid} && ${arrayExpr}) ${arrayExpr}.forEach((${inner.param}, __innerIdx${uid}) => {`)
      ls.push(`${indent}  const __innerEl${uid} = __ic${uid}.children[__innerIdx${uid}]`)
      ls.push(`${indent}  if (!__innerEl${uid}) return`)
      if (inner.key) {
        ls.push(`${indent}  __innerEl${uid}.setAttribute('${keyAttrName(inner.depth)}', String(${inner.key}))`)
      }
      emitComponentAndEventSetup(ls, `${indent}  `, `__innerEl${uid}`, level.comps, level.events, mode, outerLoopParam)
      // Recurse for child levels (nested deeper loops)
      if (childLevels.length > 0) {
        emitInnerLoopSetup(ls, `${indent}  `, `__innerEl${uid}`, childLevels, mode, outerLoopParam)
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
  elem: LoopElement,
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

  lines.push(`  mapArray(() => ${chainedExpr}, _${vLoop}, ${keyFn}, (${elem.param}, ${indexParam}, __existing) => {`)
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
const NON_BUBBLING_EVENTS = new Set(['blur', 'focus', 'load', 'unload'])

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
      const handlerCall = ev.handler.trim().startsWith('(') || ev.handler.trim().startsWith('function')
        ? `(${ev.handler})(e)`
        : ev.handler
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
