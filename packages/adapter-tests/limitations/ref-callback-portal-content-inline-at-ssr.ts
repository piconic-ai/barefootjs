import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Portal content relocated from a ref callback renders inline on the server',
  given:
    'a component that moves part of its own markup to `document.body` from a `ref` callback (`createPortal(el, document.body, { ownerScope })`), the overlay/content pattern the dialog-style primitives use',
  expected:
    'the server HTML places the portaled subtree where the hydrated DOM has it — appended to the body after the component root, carrying its owner scope as `bf-po` — so hydration changes nothing',
  // #3059 fixed this on the reference adapter (Hono): the compiler now
  // recognizes the `ref`-callback pattern structurally
  // (`ssrPortalOwnerScope`, `isSsrPortalRefCallback` in
  // `@barefootjs/jsx`) and the Hono adapter renders the flagged element
  // through the `<BfPortals />` outlet (`collectSsrPortalElement`,
  // `packages/adapter-hono/src/portals.tsx`) with `bf-po` stamped
  // directly on it — matching what the client `createPortal` stamps at
  // hydrate time, so hydration is now a no-op for these adapters. Every
  // OTHER adapter has no such outlet yet (#3059's own "Open questions" —
  // where the outlet goes when the layout isn't owned by BarefootJS) and
  // still exhibits the divergence below; this entry now scopes to them.
  // (`combobox` / `select` carry the SAME divergence on every non-Hono
  // adapter — their content is portaled the identical way — but are
  // already claimed by `ref-effect-attr-state-ssr` for an unrelated
  // reason, and a fixture can only be listed on one entry; their
  // `render-divergences.ts` pins cite that entry instead, with a comment
  // pointing back here.)
  actual:
    'renders the portaled subtree inline at its source position with no `bf-po` on every adapter besides Hono (a `ref` callback never runs at SSR); the hydrate-time callback then moves it to the end of `document.body` and stamps `bf-po`, so pre- and post-hydration DOM differ structurally',
  fixtures: ['dialog', 'dropdown-menu', 'popover', 'portal'],
})
