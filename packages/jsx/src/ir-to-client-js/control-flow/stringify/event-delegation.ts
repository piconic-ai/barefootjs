/**
 * Stringify an `EventDelegationPlan` to source lines.
 *
 * Output shape:
 *
 *     if (<container>) <container>.addEventListener('<eventName>', (__bfEvt) => {
 *       const target = __bfEvt.target
 *       const <slot>El = target.closest('[bf="<slotId>"]')
 *       if (<slot>El && <container>.contains(<slot>El)) {
 *         <item-lookup specific>
 *         <handlerCall>
 *         return
 *       }
 *       ... more events sharing the same name (deepest-first)
 *     })   // or `}, true)` for non-bubbling events
 *
 * The synthetic event parameter is named `__bfEvt` (not `e`) so that user
 * loop params named `e` (e.g. `edges.map(e => ...)`) do not shadow the
 * event when their handler is inlined into this scope. See #135 / Block
 * Graph Editor: an inline handler `onPointerDown={(ev) => setX(e.id)}`
 * was previously called as `(handler)(e)` where `e` resolved to the loop
 * item, not the event — so `ev.target` was undefined and
 * `ev.stopPropagation()` threw at runtime.
 *
 * Item lookup shapes:
 *   - keyed (no nested loops):   `closest('[data-key]')` + `arr.find`
 *   - keyed (nested loops):       multi-level data-key-N + outer find + inner find
 *   - dynamic-index:              `closest('li, [bf-i]') + indexOf`
 *   - static-index:               walk-up + indexOf - offset
 *
 * Each shape has a `hasBindings` variant that lands on a `__bfLoopItem`
 * sentinel before destructuring (#951 TDZ-safe).
 */

import { toDomEventName, varSlotId, substituteLoopBindings, buildLoopChildIndexSubtraction, DATA_KEY, keyAttrName } from '../../utils.ts'
import { extractFreeIdentifiersFromText } from '../../csr-substitute.ts'
import type {
  EventDelegationPlan,
  KeyedItemLookup,
  DynamicIndexItemLookup,
  StaticIndexItemLookup,
  LoopChildEvent,
} from '../plan/types.ts'

/** Non-bubbling events that require addEventListener with capture for delegation. */
const NON_BUBBLING_EVENTS = new Set([
  'blur', 'focus', 'load', 'unload',
  'mouseenter', 'mouseleave',
  'pointerenter', 'pointerleave',
])

/**
 * Profile mode (#1690, SR3): bracket a delegated handler call with turn
 * markers so a profiling run attributes the reactive work it triggers to one
 * turn. `call` is the inline invocation (e.g. `(handler)(__bfEvt)`); the
 * wrapper keeps it a single statement so it drops into every lookup shape.
 */
function withTurn(call: string, componentName: string | undefined, childSlotId: string, eventName: string): string {
  if (!componentName) return call
  const id = JSON.stringify(`${componentName}#handler:${childSlotId}:${eventName}`)
  return `beginTurn(${id}); try { ${call} } finally { endTurn() }`
}

/**
 * Bind the loop index under the user's param name for a delegated handler that
 * closes over it (#2189). Returns `null` when there is no index param, the
 * handler doesn't reference it (so unaffected loops keep byte-for-byte output),
 * or the name already equals the in-scope index var (a self-alias). Uses AST
 * free identifiers, not a token match, so `item.id` (property) doesn't count.
 */
function indexBindingLine(handler: string, indexParam: string | null, indexExpr: string): string | null {
  if (!indexParam || indexParam === indexExpr) return null
  if (!extractFreeIdentifiersFromText(handler).has(indexParam)) return null
  return `const ${indexParam} = ${indexExpr}`
}

export function stringifyEventDelegation(lines: string[], plan: EventDelegationPlan): void {
  const { containerVar, events, itemLookup, profileComponentName } = plan
  const eventsByName = new Map<string, LoopChildEvent[]>()
  for (const ev of events) {
    if (!eventsByName.has(ev.eventName)) eventsByName.set(ev.eventName, [])
    eventsByName.get(ev.eventName)!.push(ev)
  }

  for (const [eventName, evs] of eventsByName) {
    // Sort deepest-first so child elements are checked before parents (#774)
    evs.sort((a, b) => b.domDepth - a.domDepth)
    const useCapture = NON_BUBBLING_EVENTS.has(eventName)
    if (useCapture) {
      lines.push(`  if (${containerVar}) ${containerVar}.addEventListener('${eventName}', (__bfEvt) => {`)
    } else {
      lines.push(`  if (${containerVar}) ${containerVar}.addEventListener('${toDomEventName(eventName)}', (__bfEvt) => {`)
    }
    lines.push(`    const target = __bfEvt.target`)
    for (const ev of evs) {
      const childVar = varSlotId(ev.childSlotId)
      // Bound the slot match to the delegating container (#2367). `bf` ids are
      // unique only *within* a component, so an unscoped
      // `target.closest('[bf="sN"]')` can match a same-id element in an ancestor
      // component and silently take the wrong branch. The container holds every
      // slot it delegates on, so a same-id ancestor is never a descendant of it —
      // the `container.contains(...)` guard rejects the foreign match and the
      // handler falls through to the correct branch.
      lines.push(`    const ${childVar}El = target.closest('[bf="${ev.childSlotId}"]')`)
      lines.push(`    if (${childVar}El && ${containerVar}.contains(${childVar}El)) {`)
      const handlerCall = withTurn(`(${ev.handler.trim()})(__bfEvt)`, profileComponentName, ev.childSlotId, ev.eventName)
      switch (itemLookup.kind) {
        case 'keyed':
          emitKeyedLookup(lines, ev, handlerCall, itemLookup)
          break
        case 'dynamic-index':
          emitDynamicIndexLookup(lines, ev, handlerCall, itemLookup)
          break
        case 'static-index':
          emitStaticIndexLookup(lines, ev, handlerCall, itemLookup, containerVar)
          break
      }
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

function emitKeyedLookup(
  ls: string[],
  ev: LoopChildEvent,
  handlerCall: string,
  lookup: KeyedItemLookup,
): void {
  const { arrayExpr, param, keyWithItem, mapPreamble, hasBindings, indexParam } = lookup

  if (ev.nestedLoops.length === 0) {
    // Single-level keyed lookup.
    const idxLine = indexBindingLine(ev.handler, indexParam, `${arrayExpr}.findIndex(item => String(${keyWithItem}) === key)`)
    ls.push(`      const li = ${varSlotId(ev.childSlotId)}El.closest('[${DATA_KEY}]')`)
    ls.push(`      if (li) {`)
    ls.push(`        const key = li.getAttribute('${DATA_KEY}')`)
    if (hasBindings) {
      // TDZ-safe shape — see #951.
      ls.push(`        const __bfLoopItem = ${arrayExpr}.find(item => String(${keyWithItem}) === key)`)
      ls.push(`        if (__bfLoopItem) {`)
      ls.push(`          const ${param} = __bfLoopItem`)
      if (mapPreamble) ls.push(`          ${mapPreamble}`)
      if (idxLine) ls.push(`          ${idxLine}`)
      ls.push(`          ${handlerCall}`)
      ls.push(`        }`)
    } else {
      ls.push(`        const ${param} = ${arrayExpr}.find(item => String(${keyWithItem}) === key)`)
      if (mapPreamble) ls.push(`        ${mapPreamble}`)
      if (idxLine) ls.push(`        if (${param}) { ${idxLine}; ${handlerCall} }`)
      else ls.push(`        if (${param}) ${handlerCall}`)
    }
    ls.push(`      }`)
    return
  }

  // Nested-loop event — multi-level data-key-N resolution.
  const evVar = varSlotId(ev.childSlotId)
  for (const nested of ev.nestedLoops) {
    const dataAttr = keyAttrName(nested.depth)
    ls.push(`      const innerLi${nested.depth} = ${evVar}El.closest('[${dataAttr}]')`)
    ls.push(`      const innerKey${nested.depth} = innerLi${nested.depth}?.getAttribute('${dataAttr}')`)
  }
  ls.push(`      const outerLi = ${evVar}El.closest('[${DATA_KEY}]')`)
  ls.push(`      const outerKey = outerLi?.getAttribute('${DATA_KEY}')`)
  if (hasBindings) {
    ls.push(`      const __bfLoopItem = ${arrayExpr}.find(item => String(${keyWithItem}) === outerKey)`)
    ls.push(`      const ${param} = __bfLoopItem ?? ({})`)
  } else {
    ls.push(`      const ${param} = ${arrayExpr}.find(item => String(${keyWithItem}) === outerKey)`)
  }
  for (const nested of ev.nestedLoops) {
    // `nested.key` may be null for unkeyed loops; coerce to '' so the lookup
    // silently no-ops (String('') never matches a real key).
    const rawKey = nested.key ?? ''
    const innerKeyExpr = nested.paramBindings && nested.paramBindings.length > 0
      ? substituteLoopBindings(rawKey, nested.paramBindings, 'item')
      : rawKey.replace(new RegExp(`\\b${nested.param}\\b`, 'g'), 'item')
    const outerRef = hasBindings ? '__bfLoopItem' : param
    ls.push(`      const ${nested.param} = ${outerRef} && ${nested.array}.find(item => String(${innerKeyExpr}) === innerKey${nested.depth})`)
  }
  const outerGuard = hasBindings ? '__bfLoopItem' : param
  const allParams = [outerGuard, ...ev.nestedLoops.map(n => n.param)]
  if (mapPreamble) ls.push(`      ${mapPreamble}`)
  const idxLine = indexBindingLine(ev.handler, indexParam, `${arrayExpr}.findIndex(item => String(${keyWithItem}) === outerKey)`)
  if (idxLine) ls.push(`      if (${allParams.join(' && ')}) { ${idxLine}; ${handlerCall} }`)
  else ls.push(`      if (${allParams.join(' && ')}) ${handlerCall}`)
}

function emitDynamicIndexLookup(
  ls: string[],
  ev: LoopChildEvent,
  handlerCall: string,
  lookup: DynamicIndexItemLookup,
): void {
  const { arrayExpr, param, mapPreamble, hasBindings, indexParam } = lookup
  const idxLine = indexBindingLine(ev.handler, indexParam, 'idx')
  ls.push(`      const li = ${varSlotId(ev.childSlotId)}El.closest('li, [bf-i]')`)
  ls.push(`      if (li && li.parentElement) {`)
  ls.push(`        const idx = Array.from(li.parentElement.children).indexOf(li)`)
  if (hasBindings) {
    ls.push(`        const __bfLoopItem = ${arrayExpr}[idx]`)
    ls.push(`        if (__bfLoopItem) {`)
    ls.push(`          const ${param} = __bfLoopItem`)
    if (mapPreamble) ls.push(`          ${mapPreamble}`)
    if (idxLine) ls.push(`          ${idxLine}`)
    ls.push(`          ${handlerCall}`)
    ls.push(`        }`)
  } else {
    ls.push(`        const ${param} = ${arrayExpr}[idx]`)
    if (mapPreamble) ls.push(`        ${mapPreamble}`)
    if (idxLine) ls.push(`        if (${param}) { ${idxLine}; ${handlerCall} }`)
    else ls.push(`        if (${param}) ${handlerCall}`)
  }
  ls.push(`      }`)
}

function emitStaticIndexLookup(
  ls: string[],
  ev: LoopChildEvent,
  handlerCall: string,
  lookup: StaticIndexItemLookup,
  containerVar: string,
): void {
  const { arrayExpr, param, mapPreamble, offset, indexParam } = lookup
  const idxLine = indexBindingLine(ev.handler, indexParam, '__idx')
  ls.push(`      let __el = ${varSlotId(ev.childSlotId)}El`)
  ls.push(`      while (__el.parentElement && __el.parentElement !== ${containerVar}) __el = __el.parentElement`)
  ls.push(`      if (__el.parentElement === ${containerVar}) {`)
  const idxOffset = buildLoopChildIndexSubtraction(offset ?? undefined)
  ls.push(`        const __idx = Array.from(${containerVar}.children).indexOf(__el)${idxOffset}`)
  ls.push(`        const ${param} = ${arrayExpr}[__idx]`)
  if (mapPreamble) ls.push(`        ${mapPreamble}`)
  if (idxLine) ls.push(`        if (${param}) { ${idxLine}; ${handlerCall} }`)
  else ls.push(`        if (${param}) ${handlerCall}`)
  ls.push(`      }`)
}
