/**
 * Client bootstrap for both docs sites (site/core, site/ui).
 *
 * Loaded once per page from the layout (`renderer.tsx`) as a module
 * `<script>`; its bundled URL comes from each site's `dist/bf-assets.ts`
 * `Assets.RouterEntry` (see the site's `vite.config.ts` `assets` option).
 * It:
 *   1. installs the client-runtime seams the router re-hydrates / disposes
 *      through (`setupStreaming` → `window.__bf_hydrate_within` +
 *      `window.__bf_dispose_within`),
 *   2. starts `@barefootjs/router` unscoped: every same-origin link is a
 *      soft navigation that swaps the layout's `bf-region`s.
 *
 * Nothing is scoped here on purpose. Pages that need a full load are
 * handled by the layouts, not by a guard: a page whose region set differs
 * from the current one (the ui site's `/studio` and `/gallery/*`, core's
 * landing vs docs shells, the playground with no region at all) makes the
 * router fall back to an ordinary navigation, and a link to a non-HTML
 * resource carries `data-bf-router="false"`.
 *
 * Same-route `?tag=` navigations on the `/components` catalog stay reactive
 * `searchParams()` updates (no region swap) via the `window.__bf_pushSearch`
 * seam, exactly as before.
 */
import { setupStreaming } from '@barefootjs/client/runtime'
import { startRouter } from '@barefootjs/router'

setupStreaming()
startRouter()
