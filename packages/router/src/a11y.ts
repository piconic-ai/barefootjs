/**
 * Focus management and route-change announcement on swap (spec/router.md
 * lifecycle step 7).
 *
 * A client swap replaces content without a browser navigation, so the browser
 * does none of the accessibility work a real page load does: focus is left on a
 * now-detached node and a screen reader never hears that the route changed.
 * After a region swap the router (a) moves focus into the new region and (b)
 * announces the route via a polite live region, mirroring what Remix/Turbo do.
 */

const LIVE_REGION_ID = 'bf-route-announcer'

/**
 * Move focus into the freshly swapped region so keyboard/AT users resume there
 * rather than at the top of a detached tree. Prefer the region's first heading
 * (gives a screen reader the page context); fall back to the region element
 * itself, made programmatically focusable without becoming a tab stop.
 */
export function focusRegion(region: Element): void {
  if (typeof document === 'undefined') return
  const target =
    (region.querySelector('h1, h2, [role="heading"]') as HTMLElement | null) ??
    (region as HTMLElement)
  if (!target) return
  // `tabindex=-1` makes an otherwise non-focusable element focusable via script
  // without inserting it into the tab order. Leave an author-set tabindex alone.
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
  try {
    target.focus({ preventScroll: true })
  } catch {
    // Older engines reject the options arg — fall back to a bare focus().
    target.focus()
  }
}

/**
 * Announce the new route through a singleton `aria-live="polite"` region kept
 * visually hidden. Setting its text after the swap lets a screen reader read
 * the new page title without stealing focus.
 */
export function announceNavigation(title: string | null): void {
  if (typeof document === 'undefined') return
  const message = (title ?? document.title ?? '').trim()
  if (!message) return
  const announcer = ensureAnnouncer()
  // Clearing first guarantees the value changes, so AT re-announces even when
  // two consecutive routes share a title.
  announcer.textContent = ''
  announcer.textContent = message
}

function ensureAnnouncer(): HTMLElement {
  const existing = document.getElementById(LIVE_REGION_ID)
  if (existing) return existing
  const el = document.createElement('div')
  el.id = LIVE_REGION_ID
  el.setAttribute('aria-live', 'polite')
  el.setAttribute('aria-atomic', 'true')
  el.setAttribute('role', 'status')
  // Visually hidden but available to assistive tech (the standard sr-only clip).
  el.style.cssText =
    'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0'
  document.body.appendChild(el)
  return el
}
