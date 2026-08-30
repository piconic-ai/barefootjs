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
 */

import type { MiddlewareHandler } from 'hono'

const CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=3600'

/**
 * Sets `Cache-Control` on cacheable GET/HEAD 2xx responses that don't
 * already carry one (e.g. `/og`'s hand-tuned image cache header is left
 * alone).
 */
export const cacheControl: MiddlewareHandler = async (c, next) => {
  await next()

  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return
  if (!c.res.ok) return
  if (c.res.headers.has('Cache-Control')) return

  c.res.headers.set('Cache-Control', CACHE_CONTROL)
}
