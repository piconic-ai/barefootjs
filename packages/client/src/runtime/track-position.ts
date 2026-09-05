/**
 * BarefootJS - Floating-element position tracking
 *
 * Keeps a `position: fixed` overlay (menu, popover, listbox, hover card)
 * anchored to its trigger for as long as it is open. Shared by every
 * site/ui overlay that positions itself from `getBoundingClientRect()`
 * so the decision below is made in one place (#2848).
 */

/**
 * Run `update` now, re-run it on every scroll (capture phase, so a
 * nested scroll container counts too) and on resize, and return the
 * dispose that detaches both listeners.
 *
 * The dispose re-runs `update` ONCE, synchronously, before detaching —
 * that final sample is the whole point of this helper. `scroll` events
 * are coalesced per rendering frame and report the scroll position at
 * dispatch time, not at scroll time. A programmatic scroll that landed
 * in the current frame (a `focus()` on an offscreen item, a
 * `scrollIntoView()`) has therefore not dispatched yet when a close
 * runs in the same frame; the listener is gone by the time the event
 * fires, and whatever position the listener would have written is lost.
 * Without the final sample the closed element's inline position depends
 * on whether a frame boundary happened to fall between that scroll and
 * the close — measured as the `dropdown-menu` idempotence oracle
 * landing on `top: -580px` / `-606px` / `33px` for the same action
 * sequence. Sampling once at dispose makes the closed position a
 * function of the geometry at close time only.
 *
 * (An `overflow: hidden` scroll lock does not narrow this window: it
 * blocks user gestures, never programmatic scrolling, on `html` and
 * `body` alike — verified in Chromium against the fixture-hydrate host.)
 *
 * @param update - Positions the element from current geometry.
 * @returns Dispose: re-runs `update` once, then detaches the listeners.
 */
export function trackPosition(update: () => void): () => void {
  update()
  const onChange = () => update()
  window.addEventListener('scroll', onChange, true)
  window.addEventListener('resize', onChange)
  return () => {
    window.removeEventListener('scroll', onChange, true)
    window.removeEventListener('resize', onChange)
    update()
  }
}
