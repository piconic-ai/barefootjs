/**
 * `event-handlers` phase — bind DOM event handlers on top-level scopes.
 *
 * Slots that live inside a conditional branch are skipped here — they
 * are bound by `insert(...)` bindEvents at runtime, so emitting them
 * twice would double-wire listeners.
 *
 * `__scope` is the synthetic root slot id used when the component's
 * root element carries the listener (no `bf=` slot).
 */

import type { ClientJsContext } from '../types.ts'
import { toDomEventName, varSlotId, wrapHandlerInBlock, wrapHandlerForTurn } from '../utils.ts'

export function emitEventHandlers(
  lines: string[],
  ctx: ClientJsContext,
  conditionalSlotIds: Set<string>,
): void {
  for (const elem of ctx.interactiveElements) {
    if (conditionalSlotIds.has(elem.slotId)) continue
    for (const event of elem.events) {
      const eventName = toDomEventName(event.name)
      // Profile mode (#1690, SR3): bracket the handler with turn markers so a
      // profiling run attributes the reactive work it triggers to this turn.
      const wrappedHandler = ctx.profile
        ? wrapHandlerForTurn(event.handler, `${ctx.componentName}#handler:${elem.slotId}:${event.name}`)
        : wrapHandlerInBlock(event.handler)
      if (elem.slotId === '__scope') {
        lines.push(`  if (__scope) __scope.addEventListener('${eventName}', ${wrappedHandler})`)
      } else {
        const v = varSlotId(elem.slotId)
        lines.push(`  if (_${v}) _${v}.addEventListener('${eventName}', ${wrappedHandler})`)
      }
    }
  }
}
