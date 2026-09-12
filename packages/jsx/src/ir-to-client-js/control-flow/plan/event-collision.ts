/**
 * Find a container's own directly-authored event handler that collides with
 * a `.map()` row's delegated dispatcher for the same DOM event (#2930).
 *
 * `.map()` rows compiled via delegation share their delegated listener's
 * node with the loop's static container — the compiler registers ONE
 * `addEventListener` on the container, resolving `event.target` back to a
 * row. When the container ALSO carries its own handler for the same event,
 * both end up as separate `addEventListener` calls on the identical DOM
 * node, so a row's `stopPropagation()` can't stop the container's own
 * handler: native DOM `stopPropagation()` only blocks bubbling to *other
 * nodes*, never other listeners already registered on the *same* node.
 *
 * This is the one place that answers "does this container slot have its own
 * handler for this event" — both `phases/event-handlers.ts` (which must
 * suppress the direct listener when the answer is yes) and
 * `control-flow.ts` (which must fold that handler into the delegated
 * dispatcher instead) call it, rather than answering the question twice.
 */

import type { InteractiveElement } from '../../types.ts'
import { toDomEventName, NON_BUBBLING_EVENTS } from '../../utils.ts'

export interface ContainerOwnHandler {
  /** The container element's own slot id (used for profile-mode turn ids). */
  slotId: string
  /** Original (pre-DOM-mapped) event name, e.g. 'contextmenu'. */
  eventName: string
  handler: string
}

/**
 * Find the container's own handler for `domEventName`, if any.
 *
 * Returns `null` for a non-bubbling event (focus/blur/…) — those delegate
 * in capture mode, and a container's own bubble-phase handler there only
 * ever fires when the container itself is the event target, never for a
 * descendant row, so there is no collision to resolve. Also returns `null`
 * when `containerSlotId` lives inside a conditional branch — that slot's
 * own handler (if any) is bound by `insert()`'s `bindEvents` in a separate
 * scope this check doesn't cover.
 */
export function findContainerOwnHandler(
  interactiveElements: InteractiveElement[],
  conditionalSlotIds: Set<string>,
  containerSlotId: string,
  domEventName: string,
): ContainerOwnHandler | null {
  if (NON_BUBBLING_EVENTS.has(domEventName)) return null
  if (conditionalSlotIds.has(containerSlotId)) return null
  const elem = interactiveElements.find(e => e.slotId === containerSlotId)
  if (!elem) return null
  const match = elem.events.find(event => toDomEventName(event.name) === domEventName)
  return match ? { slotId: containerSlotId, eventName: match.name, handler: match.handler } : null
}
