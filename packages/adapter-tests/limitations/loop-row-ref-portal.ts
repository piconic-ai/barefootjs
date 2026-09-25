import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A `ref`-callback portal on a loop-row element',
  given:
    'an element inside a keyed `.map()` row that has an event handler and a `ref` callback moving it out of the row with `createPortal(el, document.body, { ownerScope })`',
  expected: 'the server HTML and the hydrated DOM agree, and clicking the element runs its handler',
  actual:
    'renders the element inside its row and moves it to `document.body` at hydration (a callback declared in the row callback places it at the portal outlet already in the server HTML), after which clicking it no longer runs its handler',
  fixtures: ['row-portal-ref'],
})
