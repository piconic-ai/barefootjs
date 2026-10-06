/**
 * Loop-row elements that a `ref` callback portals out of their row (#3318).
 *
 * A keyed `.map()` row can carry an element whose `ref` callback moves it
 * elsewhere (`createPortal(el, document.body, { ownerScope })`). Such an
 * element still belongs to its row: the row's reactive lookups must reach
 * it, the row's disposal must remove it, and the loop's delegated event
 * listeners must fire for it. None of that follows from DOM position once
 * the element sits outside the loop container, so this module records the
 * relation explicitly:
 *
 *   - `adoptRowPortal` registers an element as relocated content of a row,
 *     attaches the container's delegated listeners to it, and removes it
 *     when the row's reactive root is disposed.
 *   - `claimRowPortals` pairs a hydrating row with the elements SSR already
 *     placed at the portal outlet. They carry the slot id (`bf`), the owner
 *     scope (`bf-po`) and the row key (`data-key`), so the pairing is by
 *     identity, not position.
 *   - `relayRowPortalEvents` registers a container's delegated listener so
 *     it also fires on every element adopted into that container, whether
 *     adopted before or after the registration.
 *   - `isRowPortalOf` answers the delegated listener's containment check.
 *   - `relocatedRowElements` lets the row-level lookups (`qsaItem`, the
 *     claim-plan marker scan) treat the relocated elements as row roots.
 *
 * A relocated element is never inserted or reordered with its row; only
 * its membership is tracked.
 */

import { onCleanup } from '@barefootjs/client/reactive'
import { BF_PORTAL_OWNER, BF_SLOT } from '@barefootjs/shared'

interface Delegate {
  type: string
  /**
   * The listener as attached to adopted elements: runs the container's
   * listener once per dispatch. Adopted elements can nest (an adopted
   * `<div>` around an adopted `<button>`), and one click bubbling through
   * both must still reach the container's listener once, as it would on
   * the container itself.
   */
  attached: EventListener
  capture: boolean
}

/** relocated element → the row and loop container it belongs to */
const rowOfElement = new WeakMap<Element, { row: Element; container: Element }>()
/** row primary element → its relocated elements, in adoption order */
const relocatedByRow = new WeakMap<Element, Element[]>()
/** loop container → its adopted relocated elements */
const adoptedByContainer = new WeakMap<Element, Set<Element>>()
/** loop container → delegated listeners relayed to its relocated elements */
const delegatesByContainer = new WeakMap<Element, Delegate[]>()

/** The elements a ref callback portaled out of `rowEl`, in adoption order. */
export function relocatedRowElements(rowEl: Element): readonly Element[] {
  return relocatedByRow.get(rowEl) ?? []
}

/**
 * Register `el` as relocated content of the row whose primary element is
 * `rowEl`, inside the loop `container`. Attaches every delegated listener
 * already relayed for `container`, and removes `el` (with its listeners and
 * registration) when the current reactive root is disposed. Call it from
 * inside the row's render so that root is the row's own. Adopting the same
 * element into the same row again is a no-op.
 */
export function adoptRowPortal(rowEl: Element, el: Element, container: Element): void {
  const current = rowOfElement.get(el)
  if (current && current.row === rowEl && current.container === container) return

  rowOfElement.set(el, { row: rowEl, container })
  const rowList = relocatedByRow.get(rowEl)
  if (rowList) rowList.push(el)
  else relocatedByRow.set(rowEl, [el])
  let adopted = adoptedByContainer.get(container)
  if (!adopted) {
    adopted = new Set()
    adoptedByContainer.set(container, adopted)
  }
  adopted.add(el)

  for (const d of delegatesByContainer.get(container) ?? []) {
    el.addEventListener(d.type, d.attached, d.capture)
    resetDeliveryAtRootOf(el, d.type)
  }

  onCleanup(() => {
    for (const d of delegatesByContainer.get(container) ?? []) {
      el.removeEventListener(d.type, d.attached, d.capture)
    }
    adoptedByContainer.get(container)?.delete(el)
    const list = relocatedByRow.get(rowEl)
    if (list) {
      const i = list.indexOf(el)
      if (i >= 0) list.splice(i, 1)
    }
    if (rowOfElement.get(el)?.row === rowEl) rowOfElement.delete(el)
    el.remove()
  })
}

/**
 * Hydration: adopt the elements SSR already placed at a portal outlet for
 * the row `rowEl`. For each slot id, the element is the one carrying that
 * slot (`bf`), the owner scope `scopeId` (`bf-po`) and the row's key
 * (`keyAttr`, `data-key` for a top-level loop). A row without a key, or a
 * slot with no such element (the row rendered it inline, or a condition
 * left it out), adopts nothing.
 */
export function claimRowPortals(
  rowEl: Element,
  scopeId: string,
  slotIds: readonly string[],
  container: Element,
  keyAttr = 'data-key',
): void {
  // `''` is a valid row key (`mapArray` accepts it); only an absent
  // attribute means the row has no key to pair by.
  const key = rowEl.getAttribute(keyAttr)
  if (key === null) return
  for (const slotId of slotIds) {
    const selector =
      `[${BF_SLOT}="${cssString(slotId)}"][${BF_PORTAL_OWNER}="${cssString(scopeId)}"][${keyAttr}="${cssString(key)}"]`
    for (const el of document.querySelectorAll(selector)) {
      if (container.contains(el)) continue
      adoptRowPortal(rowEl, el, container)
    }
  }
}

/**
 * Relay the delegated listener registered on `container` to the elements
 * adopted into it: attaches it to every element adopted so far and to every
 * element adopted later, once per dispatch even where adopted elements nest.
 * The caller still registers the listener on `container` itself for the
 * rows that stay inline.
 */
export function relayRowPortalEvents(
  container: Element,
  type: string,
  listener: EventListener,
  capture = false,
): void {
  // Run at the first adopted element a dispatch reaches and skip the rest.
  // The record of what was delivered is cleared where a dispatch starts: a
  // capture listener on `window`, or, for a non-composed event targeted
  // inside a shadow root, on that shadow root. A path that starts at neither
  // (a detached outlet) falls back to the record itself:
  // within one dispatch this listener visits each adopted element at most
  // once, so reaching an element it already visited for this event, or a
  // different target, means a new dispatch. Nothing reads DOM ancestry,
  // which a handler earlier in the dispatch may have changed.
  const delegate: Delegate = { type, attached: () => {}, capture }
  delegate.attached = event => {
    let records = deliveryRecords.get(event)
    if (!records) {
      records = new Map()
      deliveryRecords.set(event, records)
    }
    const at = event.currentTarget
    const record = records.get(delegate)
    if (record && record.target === event.target && at && !record.visited.has(at)) {
      record.visited.add(at)
      return
    }
    records.set(delegate, { target: event.target, visited: new Set(at ? [at] : []) })
    listener(event)
  }
  const list = delegatesByContainer.get(container)
  if (list) list.push(delegate)
  else delegatesByContainer.set(container, [delegate])
  if (typeof window !== 'undefined') resetDeliveryAt(window, type, () => true)
  for (const el of adoptedByContainer.get(container) ?? []) {
    el.addEventListener(type, delegate.attached, capture)
    resetDeliveryAtRootOf(el, type)
  }
}

/**
 * event → per relay, the dispatch it last delivered in: the event's target
 * and the adopted elements the relay has visited since.
 */
const deliveryRecords = new WeakMap<Event, Map<Delegate, { target: EventTarget | null; visited: Set<EventTarget> }>>()
/** event-path root → the event types whose dispatch start it already clears */
const resetInstalled = new WeakMap<EventTarget, Set<string>>()

/**
 * Clear an event's delivery records when a dispatch starts at `root`:
 * `isStart` tells whether `root` is where this event's path begins, so a
 * root the dispatch merely passes through never clears a delivery already
 * made earlier in the same dispatch.
 */
function resetDeliveryAt(root: EventTarget, type: string, isStart: (event: Event) => boolean): void {
  let types = resetInstalled.get(root)
  if (!types) {
    types = new Set()
    resetInstalled.set(root, types)
  }
  if (types.has(type)) return
  types.add(type)
  root.addEventListener(type, event => {
    if (isStart(event)) deliveryRecords.delete(event)
  }, true)
}

/**
 * `resetDeliveryAt` for the shadow root `el` lives in, if any. A shadow root
 * starts the path only of a non-composed event targeted inside it (that
 * event never reaches `window`); any other event through it, such as a
 * click on a slotted light-DOM element, started at `window` and must keep
 * its record.
 */
function resetDeliveryAtRootOf(el: Element, type: string): void {
  const root = el.getRootNode()
  if (typeof ShadowRoot === 'undefined' || !(root instanceof ShadowRoot)) return
  resetDeliveryAt(root, type, event =>
    !event.composed && event.target instanceof Node && event.target.getRootNode() === root)
}

/**
 * Whether `node` is, or sits inside, an element portaled out of a row of
 * the loop `container`. The delegated listener's containment check:
 * `container.contains(target) || isRowPortalOf(target, container)`.
 */
export function isRowPortalOf(node: Node | null, container: Element): boolean {
  for (let el = node instanceof Element ? node : node?.parentElement ?? null; el; el = el.parentElement) {
    const owner = rowOfElement.get(el)
    if (owner) return owner.container === container
  }
  return false
}

/**
 * Give every element relocated out of `rowEl` the row's key, as `mapArray`
 * does for the row's primary element. A template clone carries the key
 * attribute present but empty, so the same falsy check applies.
 */
export function backfillRowPortalKeys(rowEl: Element, keyAttr: string, key: string): void {
  for (const el of relocatedByRow.get(rowEl) ?? []) {
    if (!el.getAttribute(keyAttr)) el.setAttribute(keyAttr, key)
  }
}

/** Escape a value for a double-quoted CSS attribute selector. */
function cssString(value: string): string {
  return value.replace(/["\\]/g, '\\$&')
}
