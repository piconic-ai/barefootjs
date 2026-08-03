/**
 * Client bootstrap for the blog.
 *
 * Loaded once per page as a module `<script>` (its bundled URL comes from
 * `dist/bf-assets.ts`'s `Assets.RouterEntry` — see `vite.config.ts`'s
 * `assets` option and `blog.tsx`). It:
 *   1. installs the client-runtime seams the router re-hydrates / disposes
 *      through (`setupStreaming` → `window.__bf_hydrate_within` +
 *      `window.__bf_dispose_within`),
 *   2. starts the router.
 *
 * Same-route `?sort=` / `?tag=` navigations become reactive `searchParams()`
 * updates (no region swap) with no extra wiring here: the router pushes the new
 * query through the `window.__bf_pushSearch` seam, which `@barefootjs/client`'s
 * `searchParams()` installs lazily the first time an island reads it.
 *
 * `@barefootjs/client*` is an ordinary bundled import here — Rollup resolves
 * it to the SAME shared chunk the compiled islands import, so there is a
 * single reactive runtime instance and `searchParams()` drives the islands'
 * effects, with no import map or external/redirect step needed.
 */
import { setupStreaming } from '@barefootjs/client/runtime'
import { startRouter } from '@barefootjs/router'

setupStreaming()
startRouter()
