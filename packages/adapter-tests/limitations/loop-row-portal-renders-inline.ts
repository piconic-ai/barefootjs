import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A loop-row element portaled by a `ref` callback renders inside its row',
  given:
    'an element inside a keyed `.map()` row whose `ref` callback moves it out of the row with `createPortal(el, document.body, { ownerScope })`',
  expected: 'the server HTML places the element at the portal outlet, carrying its row key, as hydration leaves it',
  actual:
    "renders the element inside its row: inside `{{range}}`, `.` is the row item, so the element's markup cannot be collected and re-executed at the outlet the way a top-level portal element is. Hydration portals the element and the row adopts it, so it keeps working, but the server HTML differs from the hydrated DOM",
  fixtures: [
    'row-portal-ref',
    'row-portal-ref-remove',
    'row-portal-ref-static',
    'row-portal-ref-branch',
    'row-portal-ref-composite',
  ],
})
