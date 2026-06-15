/**
 * Client bootstrap for the router-blog.
 *
 * Loaded once per page as a module `<script>`. It:
 *   1. installs the client-runtime seams the router re-hydrates / disposes
 *      through (`setupStreaming` → `window.__bf_hydrate_within` +
 *      `window.__bf_dispose_within`),
 *   2. loads `@barefootjs/router/signals`, which installs the
 *      `window.__bf_set_search` seam so same-route `?sort=` / `?tag=`
 *      navigations become reactive `searchParams()` updates (no outlet swap),
 *   3. starts the router.
 *
 * `@barefootjs/client*` is left external in the bundle and resolved through
 * the page's import map to the SAME `barefoot.js` the compiled islands use —
 * so there is a single reactive runtime instance and `searchParams()` drives
 * the islands' effects.
 */
import { setupStreaming } from '@barefootjs/client/runtime'
import { startRouter } from '@barefootjs/router'
import '@barefootjs/router/signals'

setupStreaming()
startRouter()
