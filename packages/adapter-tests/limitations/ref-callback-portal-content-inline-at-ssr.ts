import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Portal content relocated from a ref callback renders inline on the server',
  given:
    'a component that moves part of its own markup to `document.body` from a `ref` callback (`createPortal(el, document.body, { ownerScope })`), the overlay/content pattern the dialog-style primitives use',
  expected:
    'the server HTML places the portaled subtree where the hydrated DOM has it — appended to the body after the component root, carrying its owner scope as `bf-po` — so hydration changes nothing',
  // #3059/#3119 fixed this on the reference adapter (Hono) and on
  // `dialog`/`dropdown-menu`/`popover`/`portal` for every DSL adapter: the
  // compiler now recognizes the `ref`-callback pattern structurally
  // (`ssrPortalOwnerScope`, `isSsrPortalRefCallback` in `@barefootjs/jsx`)
  // and each adapter renders the flagged element through its own portal
  // outlet (Hono's `<BfPortals />`, Go's `{{.Portals.Render}}`, …) with
  // `bf-po` stamped directly on it — matching what the client
  // `createPortal` stamps at hydrate time, so hydration is now a no-op for
  // those four fixtures on every adapter.
  //
  // `combobox` / `select` carry the SAME divergence on every non-Hono
  // adapter (their `Content` element is portaled the identical
  // `ref`-callback way), but a fixture can only be listed on one entry —
  // both were parked under `nested-child-static-prop-text-slot-elided`
  // (an unrelated text-slot-marker mismatch that also cited combobox/
  // select) purely as registry bookkeeping. That entry graduated (#3160),
  // so this is their correct home again: on Hono, `bf-po` already appears
  // in `combobox`/`select`'s SSR output the same way it does for the four
  // graduated fixtures; every other adapter still renders their portaled
  // `Content` inline at SSR, with `bf-po` added only after the client
  // `ref` callback runs.
  actual:
    'renders the portaled subtree inline at its source position with no `bf-po` on every adapter besides Hono (a `ref` callback never runs at SSR); the hydrate-time callback then moves it to the end of `document.body` and stamps `bf-po`, so pre- and post-hydration DOM differ structurally',
  fixtures: ['combobox', 'select'],
})
