import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Portal content relocated from a ref callback renders inline on the server',
  given:
    'a component that moves part of its own markup to `document.body` from a `ref` callback (`createPortal(el, document.body, { ownerScope })`), the overlay/content pattern the dialog-style primitives use',
  expected:
    'the server HTML places the portaled subtree where the hydrated DOM has it — appended to the body after the component root, carrying its owner scope as `bf-po` — so hydration changes nothing',
  // The reference adapter and `dialog`/`dropdown-menu`/`popover`/`portal`
  // on every DSL adapter already render this correctly: the compiler
  // recognizes the `ref`-callback pattern structurally
  // (`ssrPortalOwnerScope`, `isSsrPortalRefCallback` in `@barefootjs/jsx`)
  // and each adapter renders the flagged element through its own portal
  // outlet with `bf-po` stamped on it. `combobox` / `select` portal their
  // `Content` the same way, but every non-Hono adapter still renders it
  // inline at SSR.
  actual:
    'renders the portaled subtree inline at its source position with no `bf-po` on every adapter besides Hono (a `ref` callback never runs at SSR); the hydrate-time callback then moves it to the end of `document.body` and stamps `bf-po`, so pre- and post-hydration DOM differ structurally',
  fixtures: ['combobox', 'select'],
})
