/**
 * The single browser copy of `@barefootjs/router/signals`. The import map
 * points `@barefootjs/router/signals` here, so the compiled `PostList` island
 * and the bootstrap share one `searchParams()` signal and one
 * `__bf_set_search` seam. `@barefootjs/client/reactive` is external → the same
 * `barefoot.js` reactive runtime the islands use.
 */
export { searchParams, setSearch } from '@barefootjs/router/signals'
