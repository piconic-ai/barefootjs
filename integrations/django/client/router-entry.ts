/**
 * Client bootstrap for the blog (Django/Jinja2 integration).
 *
 * Loaded once per page as a module `<script>`. It:
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
 * `@barefootjs/client*` is left external in the bundle and resolved through the
 * page's import map to the SAME `barefoot.js` the compiled islands use — so
 * there is a single reactive runtime instance and `searchParams()` drives the
 * islands' effects.
 */
import { setupStreaming } from '@barefootjs/client/runtime'
import { startRouter } from '@barefootjs/router'

setupStreaming()
startRouter()
