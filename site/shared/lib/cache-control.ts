/**
 * Cloudflare Workers Cache (`[cache] enabled = true` in wrangler.toml) caches
 * a Worker-generated response only when its `Cache-Control` header allows
 * it. barefootjs.dev and ui.barefootjs.dev render docs/landing/gallery pages
 * that are identical for every visitor and only change on the next deploy,
 * so they're safe to cache.
 *
 * Shorter-lived than `integrations/shared/lib/cache-control.ts`'s: this repo
 * pushes to `main` several times a day, and a stale docs page is a worse
 * outcome here than a stale demo page in an example nobody is actively
 * editing.
 *
 * IMPORTANT: an *absent* `Cache-Control` header does NOT opt a response out
 * of Workers Cache. Cloudflare applies RFC 9111 heuristic freshness to any
 * response with no explicit directive (e.g. a 200 OK gets a 2h TTL by
 * default). The integrations' copy of this helper shipped a version that
 * relied on an absent header to mean "don't cache" once already
 * (piconic-ai/barefootjs#2784) and it cached session-specific responses
 * across visitors.
 *
 * That bug was a symptom of a bigger structural risk: the old shape was a
 * DENYLIST — cache by default, with a short list of conditions (Cookie,
 * Set-Cookie, non-2xx) that opted a response OUT. Any response shape
 * nobody had thought of yet inherited the default of "cached". This is
 * instead an ALLOWLIST: the default below is unconditionally `no-store`,
 * and the one non-2xx-cookie-free case must explicitly earn a longer TTL.
 * A new response shape nobody has reasoned about yet inherits "not
 * cached" — unsafe-by-default instead of cached-by-default. Neither app
 * sets a cookie today, but this holds even if one starts to.
 */

import type { MiddlewareHandler } from 'hono'

const CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=3600'
// The edge's own freshness for the same responses, read by Workers Cache
// and stripped before the response reaches the browser. Only set by
// `workersCacheControl`, i.e. only by a Worker that has `[cache] enabled =
// true` behind it (site/ui): the reasoning below is a Workers Cache
// property, so a Worker without it must not carry the header into a future
// cache it did not decide on. It can be far longer than the browser's: the
// Worker version is part of the Workers Cache key by default, so every
// deploy starts from an empty edge cache and a page can never outlive the
// deploy that rendered it there — while a browser's copy is only bounded by
// `CACHE_CONTROL` above. The longer this is, the fewer requests reach the
// Worker at all (a cache hit costs no CPU time). If `cross_version_cache`
// is ever turned on, this stops being invalidated by deploys and must come
// down (or be purged on deploy).
const CDN_CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800'
// The default. Must be set explicitly (not just "no Cache-Control")
// because an absent header still gets Cloudflare's heuristic-freshness
// default TTL.
const PRIVATE_CACHE_CONTROL = 'private, no-store'

/**
 * Sets `Cache-Control` on cacheable GET/HEAD 2xx responses that don't
 * already carry one (e.g. `/og`'s hand-tuned image cache header is left
 * alone) — or an explicit `private, no-store` for anything that isn't a
 * recognized-safe case: non-2xx, or either side of the exchange carries a
 * session cookie. Neither app sets one today, but caching a `Set-Cookie`
 * response (or a request that already has a `Cookie`) as `public` would
 * replay one visitor's cookie or personalized response to everyone else,
 * so the guard stays even though it's currently a no-op.
 *
 * With `edge`, a cacheable response also gets the Workers Cache TTL
 * (`Cloudflare-CDN-Cache-Control`, see `CDN_CACHE_CONTROL`).
 */
function createCacheControl({ edge }: { edge: boolean }): MiddlewareHandler {
  return async (c, next) => {
    await next()

    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return
    if (c.res.headers.has('Cache-Control')) return

    // Default: do not cache. The one case below must explicitly opt in.
    if (!c.res.ok || c.req.header('Cookie') || c.res.headers.has('Set-Cookie')) {
      c.res.headers.set('Cache-Control', PRIVATE_CACHE_CONTROL)
      return
    }

    c.res.headers.set('Cache-Control', CACHE_CONTROL)
    if (edge) c.res.headers.set('Cloudflare-CDN-Cache-Control', CDN_CACHE_CONTROL)
  }
}

/** Browser caching only, for a Worker without Workers Cache. */
export const cacheControl: MiddlewareHandler = createCacheControl({ edge: false })

/** Browser caching plus the edge TTL, for a Worker with `[cache] enabled = true`. */
export const workersCacheControl: MiddlewareHandler = createCacheControl({ edge: true })
