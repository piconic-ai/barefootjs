/**
 * Cloudflare Workers Cache (`[cache] enabled = true` in wrangler.toml) caches
 * a Worker-generated response only when its `Cache-Control` header allows
 * it. barefootjs.dev and ui.barefootjs.dev render docs/landing/gallery pages
 * that are identical for every visitor and only change on the next deploy,
 * so they're safe to cache — but nothing in either app sets the header today.
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
 */
export const cacheControl: MiddlewareHandler = async (c, next) => {
  await next()

  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return
  if (c.res.headers.has('Cache-Control')) return

  // Default: do not cache. The one case below must explicitly opt in.
  let cacheControlValue = PRIVATE_CACHE_CONTROL

  if (c.res.ok && !c.req.header('Cookie') && !c.res.headers.has('Set-Cookie')) {
    cacheControlValue = CACHE_CONTROL
  }

  c.res.headers.set('Cache-Control', cacheControlValue)
}
