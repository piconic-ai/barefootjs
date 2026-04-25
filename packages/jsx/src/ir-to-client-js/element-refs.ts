/**
 * Element ref declarations — `const [_s0, _s1] = $(…, 's0', 's1')`.
 *
 * Every element the init body needs to find at hydration time (events,
 * dynamic text, loops, refs, reactive attrs, reactive props, rest-attr
 * elements, child component slots) is emitted via one of three finders:
 *
 *   `$(…)`  — regular DOM elements (bf-*)
 *   `$t(…)` — text comment markers for dynamic text (`<!--bf:sN-->`)
 *   `$c(…)` — component slots (bf-s, component-rooted)
 *
 * Slots inside conditional branches are excluded here because
 * `insert()` bindEvents re-queries them when the branch activates.
 * Component slots take precedence over regular slots (#360): when a
 * loop inherits its parent component's slot ID, both need the same
 * DOM element reference and `$c` is the right selector.
 */

import type { ClientJsContext } from './types'
import { collectConditionalSlotIds } from './emit-init-sections'
import { varSlotId } from './utils'

/**
 * Generate `const _slotId = find(...)` declarations for all elements
 * that need direct DOM references.
 */
export function generateElementRefs(ctx: ClientJsContext): string {
  const regularSlots = new Set<string>()
  const textSlots = new Set<string>()
  const componentSlots = new Set<string>()
  const conditionalSlotIds = collectConditionalSlotIds(ctx)

  for (const elem of ctx.interactiveElements) {
    if (elem.slotId !== '__scope' && !conditionalSlotIds.has(elem.slotId)) {
      regularSlots.add(elem.slotId)
    }
  }
  for (const elem of ctx.dynamicElements) {
    if (!elem.insideConditional) {
      textSlots.add(elem.slotId)
    }
  }
  for (const elem of ctx.conditionalElements) {
    regularSlots.add(elem.slotId)
  }
  for (const elem of ctx.loopElements) {
    regularSlots.add(elem.slotId)
  }
  for (const elem of ctx.refElements) {
    if (!conditionalSlotIds.has(elem.slotId)) {
      regularSlots.add(elem.slotId)
    }
  }
  for (const attr of ctx.reactiveAttrs) {
    regularSlots.add(attr.slotId)
  }
  for (const prop of ctx.reactiveProps) {
    componentSlots.add(prop.slotId)
  }
  for (const child of ctx.childInits) {
    if (child.slotId) {
      componentSlots.add(child.slotId)
    }
  }
  for (const rest of ctx.restAttrElements) {
    regularSlots.add(rest.slotId)
  }

  // Component slots take precedence over regular slots (#360) — see
  // header comment for the why.
  for (const slotId of componentSlots) {
    regularSlots.delete(slotId)
  }

  if (regularSlots.size === 0 && textSlots.size === 0 && componentSlots.size === 0) return ''

  const refLines: string[] = []
  emitSlotRefs(refLines, [...regularSlots], '$')
  emitSlotRefs(refLines, [...textSlots], '$t')
  emitSlotRefs(refLines, [...componentSlots], '$c')
  return refLines.join('\n')
}

function emitSlotRefs(lines: string[], slotIds: string[], fn: string): void {
  if (slotIds.length === 0) return
  const vars = slotIds.map(id => `_${varSlotId(id)}`).join(', ')
  const args = slotIds.map(id => `'${id}'`).join(', ')
  lines.push(`  const [${vars}] = ${fn}(__scope, ${args})`)
}
