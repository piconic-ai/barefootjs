import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Portal content relocated from a ref callback renders inline on the server',
  given:
    'a component that moves part of its own markup to `document.body` from a `ref` callback (`createPortal(el, document.body, { ownerScope })`), the overlay/content pattern the dialog-style primitives use',
  expected:
    'the server HTML places the portaled subtree where the hydrated DOM has it — appended to the body after the component root, carrying its owner scope as `bf-po` — so hydration changes nothing',
  actual:
    'renders the portaled subtree inline at its source position with no `bf-po` (a `ref` callback never runs at SSR); the hydrate-time callback then moves it to the end of `document.body` and stamps `bf-po`, so pre- and post-hydration DOM differ structurally',
  fixtures: ['dialog', 'dropdown-menu', 'popover', 'portal'],
})
