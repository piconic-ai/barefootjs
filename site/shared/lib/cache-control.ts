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
 * default), so every branch below that must not be cached sets an explicit
 * `private, no-store` rather than merely leaving the header unset. The
 * integrations' copy of this helper shipped the "just leave it unset"
 * version once already (piconic-ai/barefootjs#2784) and it cached
 * session-specific responses across visitors — do not regress to that shape
 * here even though neither site sets a cookie today.
 */

import type { MiddlewareHandler } from 'hono'

const CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=3600'
// Explicit opt-out. Must be set (not just "no Cache-Control") because an
// absent header still gets Cloudflare's heuristic-freshness default TTL.
const PRIVATE_CACHE_CONTROL = 'private, no-store'

/**
 * Sets `Cache-Control` on cacheable GET/HEAD 2xx responses that don't
 * already carry one (e.g. `/og`'s hand-tuned image cache header is left
 * alone) — or explicitly opts a response out with `private, no-store` when
 * it isn't safely cacheable: non-2xx, or either side of the exchange
 * carries a session cookie. Neither app sets one today, but caching a
 * `Set-Cookie` response (or a request that already has a `Cookie`) as
 * `public` would replay one visitor's cookie or personalized response to
 * everyone else, so the guard stays even though it's currently a no-op.
 */
export const cacheControl: MiddlewareHandler = async (c, next) => {
  await next()

  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return
  if (c.res.headers.has('Cache-Control')) return

  const isUncacheable = !c.res.ok || Boolean(c.req.header('Cookie')) || c.res.headers.has('Set-Cookie')

  c.res.headers.set('Cache-Control', isUncacheable ? PRIVATE_CACHE_CONTROL : CACHE_CONTROL)
}
