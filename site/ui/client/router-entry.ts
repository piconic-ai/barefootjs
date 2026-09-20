/**
 * Client bootstrap for the `/components` catalog page.
 *
 * Loaded once on that page as a module `<script>` (its bundled URL comes from
 * `dist/bf-assets.ts`'s `Assets.RouterEntry` — see `vite.config.ts`'s
 * `assets` option and `pages/components/catalog.tsx`). It:
 *   1. installs the client-runtime seams the router re-hydrates / disposes
 *      through (`setupStreaming` → `window.__bf_hydrate_within` +
 *      `window.__bf_dispose_within`),
 *   2. starts `@barefootjs/router`, scoped to the catalog's filter chips.
 *
 * Clicking a chip is a same-route, query-only navigation: the router pushes
 * the new `?tag=` through the `window.__bf_pushSearch` seam, `searchParams()`
 * updates, and the `CatalogFilter` island reacts fine-grained (its
 * `data-filter` attribute is what `globals.css` filters the server-rendered
 * card grid on) — no region swap, no re-hydration, no full page load.
 *
 * `shouldIntercept` limits the router to same-origin links inside
 * `[data-catalog-filter]`: every other link on the docs site keeps ordinary
 * browser navigation, since the site's layouts carry no `<Region>` to swap
 * into yet. Site-wide adoption (Regions in both layouts, unscoped
 * interception) is #3105. The option REPLACES the router's default guards
 * (origin, `target`, `rel="external"`, same-page hash), so the origin check
 * is repeated here; the chips are `queryHref()` results with none of the
 * other traits, and a link with them does not belong in the filter bar.
 */
import { setupStreaming } from '@barefootjs/client/runtime'
import { startRouter } from '@barefootjs/router'

setupStreaming()
startRouter({
  shouldIntercept: (anchor) =>
    anchor.origin === window.location.origin && anchor.closest('[data-catalog-filter]') !== null,
})
