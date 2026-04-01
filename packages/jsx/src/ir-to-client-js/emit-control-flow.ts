/**
 * Control flow emission: conditionals and loops.
 * Handles insert() for reactive conditionals, reconcileElements for dynamic loops,
 * and event delegation within loop containers.
 */

import type { ClientJsContext, ConditionalBranchEvent, ConditionalBranchRef, ConditionalBranchChildComponent, ConditionalBranchTextEffect, LoopChildEvent, LoopElement } from './types'
import { toDomEventName, wrapHandlerInBlock, varSlotId, buildChainedArrayExpr, quotePropName, DATA_KEY, DATA_BF_PH, keyAttrName } from './utils'
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
  textEffects: ConditionalBranchTextEffect[] = []
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

  // Emit disposable text effects scoped to this branch.
  // These only run while the branch is active and are disposed on branch switch.
  // Text node is resolved once (stable while branch is active) and closed over.
  if (textEffects.length > 0) {
    lines.push(`      const __disposers = []`)
    for (const te of textEffects) {
      const v = varSlotId(te.slotId)
      lines.push(`      const [__el_${v}] = $t(__branchScope, '${te.slotId}')`)
      lines.push(`      __disposers.push(createDisposableEffect(() => {`)
      lines.push(`        const __val = ${te.expression}`)
      lines.push(`        if (__el_${v} && !__val?.__isSlot) __el_${v}.nodeValue = String(__val ?? '')`)
      lines.push(`      }))`)
    }
    lines.push(`      return () => __disposers.forEach(d => d())`)
  }
}

/** Emit insert() calls for server-rendered reactive conditionals with branch configs. */
export function emitConditionalUpdates(lines: string[], ctx: ClientJsContext): void {
  for (const elem of ctx.conditionalElements) {
    const whenTrueWithCond = addCondAttrToTemplate(elem.whenTrueHtml, elem.slotId)
    const whenFalseWithCond = addCondAttrToTemplate(elem.whenFalseHtml, elem.slotId)

    lines.push(`  insert(__scope, '${elem.slotId}', () => ${elem.condition}, {`)
    lines.push(`    template: () => \`${whenTrueWithCond}\`,`)
    lines.push(`    bindEvents: (__branchScope) => {`)
    emitBranchBindings(lines, elem.whenTrueEvents, elem.whenTrueRefs, elem.whenTrueChildComponents, toDomEventName, elem.whenTrueTextEffects)
    lines.push(`    }`)
    lines.push(`  }, {`)
    lines.push(`    template: () => \`${whenFalseWithCond}\`,`)
    lines.push(`    bindEvents: (__branchScope) => {`)
    emitBranchBindings(lines, elem.whenFalseEvents, elem.whenFalseRefs, elem.whenFalseChildComponents, toDomEventName, elem.whenFalseTextEffects)
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
    emitBranchBindings(lines, elem.whenTrueEvents, elem.whenTrueRefs, elem.whenTrueChildComponents, rawEventName, elem.whenTrueTextEffects)
    lines.push(`    }`)
    lines.push(`  }, {`)
    lines.push(`    template: () => \`${whenFalseWithCond}\`,`)
    lines.push(`    bindEvents: (__branchScope) => {`)
    emitBranchBindings(lines, elem.whenFalseEvents, elem.whenFalseRefs, elem.whenFalseChildComponents, rawEventName, elem.whenFalseTextEffects)
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
  comp: { props: Array<{ name: string; value: string; isEventHandler: boolean; isLiteral: boolean }>, children?: import('../types').IRNode[] }
): string {
  const entries = comp.props.map((p) => {
    if (p.isEventHandler) {
      return `${quotePropName(p.name)}: ${p.value}`
    } else if (p.isLiteral) {
      return `get ${quotePropName(p.name)}() { return ${JSON.stringify(p.value)} }`
    } else {
      return `get ${quotePropName(p.name)}() { return ${p.value} }`
    }
  })
  if ('children' in comp && Array.isArray(comp.children) && comp.children.length > 0) {
    const childrenExpr = irChildrenToJsExpr(comp.children)
    entries.push(`get children() { return ${childrenExpr} }`)
  }
  return entries.length > 0 ? `{ ${entries.join(', ')} }` : '{}'
}

/** Emit reconcileElements for a loop whose body is a single child component. */
function emitComponentLoopReconciliation(lines: string[], elem: LoopElement, keyFn: string): void {
  const { name } = elem.childComponent!
  const vLoop = varSlotId(elem.slotId)
  const propsExpr = buildComponentPropsExpr(elem.childComponent!)
  const keyExpr = elem.key || '__idx'
  const indexParam = elem.index || '__idx'
  const chainedExpr = buildChainedArrayExpr(elem)

  lines.push(`  createEffect(() => {`)
  lines.push(`    reconcileElements(_${vLoop}, ${chainedExpr}, ${keyFn}, (${elem.param}, ${indexParam}) =>`)
  lines.push(`      createComponent('${name}', ${propsExpr}, ${keyExpr})`)
  lines.push(`    )`)
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

/** Emit reconcileElements for a plain element loop with hydration support. */
function emitPlainElementLoopReconciliation(lines: string[], elem: LoopElement, keyFn: string): void {
  const vLoop = varSlotId(elem.slotId)
  const chainedExpr = buildChainedArrayExpr(elem)
  const indexParam = elem.index || '__idx'

  lines.push(`  createEffect(() => {`)
  lines.push(`    const __arr = ${chainedExpr}`)
  if (elem.mapPreamble) {
    lines.push(`    const __renderItem = (${elem.param}, ${indexParam}) => { ${elem.mapPreamble}; const __tpl = document.createElement('template'); __tpl.innerHTML = \`${elem.template}\`; return __tpl.content.firstElementChild.cloneNode(true) }`)
  } else {
    lines.push(`    const __renderItem = (${elem.param}, ${indexParam}) => { const __tpl = document.createElement('template'); __tpl.innerHTML = \`${elem.template}\`; return __tpl.content.firstElementChild.cloneNode(true) }`)
  }
  emitHydrationTagging(lines, elem, vLoop, indexParam)
  lines.push(`    reconcileElements(_${vLoop}, __arr, ${keyFn}, __renderItem)`)
  lines.push(`  })`)
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

/** Per-depth-level data for composite loop emission. */
interface DepthLevel {
  comps: (LoopElement['nestedComponents'] & {})[number][]
  events: LoopChildEvent[]
  loopInfo: { array: string; param: string; key: string; depth: number; containerSlotId?: string | null } | null
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
function emitEventSetup(ls: string[], indent: string, elVar: string, ev: LoopChildEvent): void {
  const handler = ev.handler.trim().startsWith('(') || ev.handler.trim().startsWith('function')
    ? `(${ev.handler})(e)`
    : ev.handler
  ls.push(`${indent}{ const __e = qsa(${elVar}, '[bf="${ev.childSlotId}"]'); if (__e) __e.addEventListener('${toDomEventName(ev.eventName)}', (e) => { ${handler} }) }`)
}

/** Build the component-finder CSS selector for SSR hydration initChild. */
function buildCompSelector(comp: { slotId?: string | null; name: string }): string {
  return comp.slotId
    ? `[bf-s$="_${comp.slotId}"], [bf-s^="~${comp.name}_"], [bf-s^="${comp.name}_"]`
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
): void {
  for (const comp of comps) {
    const propsExpr = buildComponentPropsExpr(comp)
    if (mode === 'csr') {
      const phId = comp.slotId || comp.name
      const keyProp = comp.props.find(p => p.name === 'key')
      const keyArg = keyProp ? `, ${keyProp.value}` : ''
      ls.push(`${indent}{ const __ph = ${elVar}.querySelector('[${DATA_BF_PH}="${phId}"]'); if (__ph) __ph.replaceWith(createComponent('${comp.name}', ${propsExpr}${keyArg})) }`)
    } else {
      const selector = buildCompSelector(comp)
      ls.push(`${indent}{ const __c = ${elVar}.querySelector('${selector}'); if (__c) initChild('${comp.name}', __c, ${propsExpr}) }`)
    }
  }
  for (const ev of events) {
    emitEventSetup(ls, indent, elVar, ev)
  }
}

/**
 * Emit the renderItem function body for composite loops.
 * Creates element from template, replaces placeholders, sets up events.
 * Handles arbitrary nesting depth (depth 1, 2, ...) via recursive emission.
 */
function emitCompositeRenderItemBody(ls: string[], indent: string, ctx: CompositeLoopContext): void {
  ls.push(`${indent}const __tpl = document.createElement('template')`)
  if (ctx.elem.mapPreamble) {
    ls.push(`${indent}${ctx.elem.mapPreamble}`)
  }
  ls.push(`${indent}__tpl.innerHTML = \`${ctx.elem.template}\``)
  ls.push(`${indent}const __el = __tpl.content.firstElementChild.cloneNode(true)`)

  // Outer-level component + event setup
  emitComponentAndEventSetup(ls, indent, '__el', ctx.outerComps, ctx.outerEvents, 'csr')

  // Inner loop levels (depth 1, 2, ...) — each level nests inside the previous
  emitInnerLoopSetup(ls, indent, '__el', ctx.depthLevels, 0, 'csr')

  ls.push(`${indent}return __el`)
}

/**
 * Recursively emit inner loop forEach + component/event setup for CSR and SSR.
 * Each depth level nests inside the previous: depth1.forEach -> depth2.forEach -> ...
 */
function emitInnerLoopSetup(
  ls: string[],
  indent: string,
  parentElVar: string,
  levels: DepthLevel[],
  levelIdx: number,
  mode: 'csr' | 'ssr',
): void {
  if (levelIdx >= levels.length) return
  const level = levels[levelIdx]
  if (!level.loopInfo && level.comps.length === 0 && level.events.length === 0) return

  const inner = level.loopInfo
  if (!inner) return

  if (mode === 'csr') {
    ls.push(`${indent}// Initialize depth-${inner.depth} loop components and events`)
    // Guard: inner loop array may be undefined when inside a conditional branch
    // (e.g., folder.children exists but file.children doesn't)
    ls.push(`${indent}if (${inner.array}) ${inner.array}.forEach((${inner.param}) => {`)
    if (inner.key) {
      ls.push(`${indent}  const __innerEl${inner.depth} = ${parentElVar}.querySelector('[${keyAttrName(inner.depth)}="' + ${inner.key} + '"]')`)
    } else {
      ls.push(`${indent}  const __innerEl${inner.depth} = null`)
    }
    ls.push(`${indent}  if (!__innerEl${inner.depth}) return`)
    emitComponentAndEventSetup(ls, `${indent}  `, `__innerEl${inner.depth}`, level.comps, level.events, 'csr')
    // Recurse for deeper levels
    emitInnerLoopSetup(ls, `${indent}  `, `__innerEl${inner.depth}`, levels, levelIdx + 1, 'csr')
    ls.push(`${indent}})`)
  } else {
    const containerSelector = inner.containerSlotId ? `'[bf="${inner.containerSlotId}"]'` : 'null'
    ls.push(`${indent}{ const __ic${inner.depth} = ${containerSelector !== 'null' ? `${parentElVar}.querySelector(${containerSelector})` : parentElVar}`)
    // Guard: inner loop array may be undefined when inside a conditional branch
    ls.push(`${indent}if (__ic${inner.depth} && ${inner.array}) ${inner.array}.forEach((${inner.param}, __innerIdx${inner.depth}) => {`)
    ls.push(`${indent}  const __innerEl${inner.depth} = __ic${inner.depth}.children[__innerIdx${inner.depth}]`)
    ls.push(`${indent}  if (!__innerEl${inner.depth}) return`)
    if (inner.key) {
      ls.push(`${indent}  __innerEl${inner.depth}.setAttribute('${keyAttrName(inner.depth)}', String(${inner.key}))`)
    }
    emitComponentAndEventSetup(ls, `${indent}  `, `__innerEl${inner.depth}`, level.comps, level.events, 'ssr')
    // Recurse for deeper levels
    emitInnerLoopSetup(ls, `${indent}  `, `__innerEl${inner.depth}`, levels, levelIdx + 1, 'ssr')
    ls.push(`${indent}}) }`)
  }
}

/**
 * Emit the hydration afterTag callback for composite loops.
 * Initializes components and events on SSR-rendered elements.
 */
function emitCompositeHydrationSetup(ls: string[], ctx: CompositeLoopContext): void {
  // Outer-level component + event setup on SSR elements
  emitComponentAndEventSetup(ls, '        ', '__hChild', ctx.outerComps, ctx.outerEvents, 'ssr')

  // Inner loop levels (depth 1, 2, ...) — each level nests inside the previous
  emitInnerLoopSetup(ls, '        ', '__hChild', ctx.depthLevels, 0, 'ssr')
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

  // Build per-depth-level data
  const maxDepth = Math.max(
    ...nestedComps.map(c => c.loopDepth ?? 0),
    ...innerLoops.map(l => l.depth),
    0,
  )
  const depthLevels: DepthLevel[] = []
  for (let d = 1; d <= maxDepth; d++) {
    const loopInfo = innerLoops.find(l => l.depth === d) ?? null
    depthLevels.push({
      comps: nestedComps.filter(c => (c.loopDepth ?? 0) === d),
      events: elem.childEvents.filter(ev =>
        ev.nestedLoops.length > 0 && ev.nestedLoops[ev.nestedLoops.length - 1].depth === d
      ),
      loopInfo,
    })
  }

  const ctx: CompositeLoopContext = {
    elem,
    outerComps: nestedComps.filter(c => !c.loopDepth || c.loopDepth === 0),
    outerEvents: elem.childEvents.filter(ev => ev.nestedLoops.length === 0),
    depthLevels,
  }

  lines.push(`  createEffect(() => {`)
  lines.push(`    const __arr = ${chainedExpr}`)
  lines.push(`    const __renderItem = (${elem.param}, ${indexParam}) => {`)
  emitCompositeRenderItemBody(lines, '      ', ctx)
  lines.push(`    }`)
  lines.push('')
  emitHydrationTagging(lines, elem, vLoop, indexParam, (ls) => {
    emitCompositeHydrationSetup(ls, ctx)
  })
  lines.push('')
  // Blur active element before reconciliation to avoid syncElementState issues.
  lines.push(`    if (_${vLoop}?.contains(document.activeElement)) document.activeElement?.blur()`)
  lines.push(`    reconcileElements(_${vLoop}, __arr, ${keyFn}, __renderItem)`)
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
