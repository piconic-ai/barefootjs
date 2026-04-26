/**
 * Pure helper: gather slot IDs that live inside a conditional branch.
 *
 * Such slots are emitted via `insert(...)` bindEvents at runtime; the
 * top-level `event-handlers` and `ref-callbacks` phases skip them so the
 * legacy single-place initialiser doesn't double-bind.
 *
 * Cached once per generate-init invocation (see `buildPhaseCtx`).
 */

import type { ClientJsContext } from '../types'

export function collectConditionalSlotIds(ctx: ClientJsContext): Set<string> {
  const slots = new Set<string>()
  for (const cond of ctx.conditionalElements) {
    for (const event of cond.whenTrue.events) slots.add(event.slotId)
    for (const event of cond.whenFalse.events) slots.add(event.slotId)
    for (const ref of cond.whenTrue.refs) slots.add(ref.slotId)
    for (const ref of cond.whenFalse.refs) slots.add(ref.slotId)
  }
  return slots
}
