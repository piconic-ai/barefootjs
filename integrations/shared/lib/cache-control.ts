/**
 * Cloudflare Workers Cache (`[cache] enabled = true` in wrangler.toml) only
 * caches a response when its `Cache-Control` header says it may — otherwise
 * every request still wakes the backing Container. None of the 15
 * language/framework backends this repo demos (Flask, Rails, Go, Rust, ...)
 * set that header on their own, so every `container.ts` shim funnels its
 * response through here before returning it. One shared decision instead of
 * fifteen copies that could quietly drift.
 *
 * Most demo pages are static per route (no auth — interactivity is
 * client-side signals over a fixed SSR shell), so caching them as `public`
 * is safe. But several integrations also serve a cookie-backed Todo demo
 * (`/todos`, `/api/todos/*`) scoped to that integration's own path, where
 * the response body and any `Set-Cookie` genuinely differ per visitor.
 * Caching those as `public` would replay one visitor's todo list — or
 * worse, their session cookie — to every other visitor for the TTL window.
 * `max-age` is tuned long for the routes we DO cache: the whole point is to
 * stop a repeat visitor from waking the Container at all.
 *
 * IMPORTANT: an *absent* `Cache-Control` header does NOT opt a response out
 * of Workers Cache. Cloudflare applies RFC 9111 heuristic freshness to any
 * response with no explicit directive (e.g. a 200 OK gets a 2h TTL by
 * default). This repo shipped a version that relied on an absent header to
 * mean "don't cache" once already (piconic-ai/barefootjs#2784) and it
 * cached session-specific Todo responses across visitors.
 *
 * That bug was a symptom of a bigger structural risk: the old shape was a
 * DENYLIST — cache by default, with a short list of conditions (Cookie,
 * Set-Cookie, non-2xx) that opted a response OUT. Any response shape nobody
 * had thought of yet inherited the default of "cached". This is instead an
 * ALLOWLIST: the default below is unconditionally `no-store`, and each
 * cacheable case must explicitly earn its way into a longer TTL. A new
 * response shape nobody has reasoned about yet inherits "not cached" —
 * unsafe-by-default instead of cached-by-default.
 */

const ASSET_EXTENSION = /\.(?:js|mjs|css|woff2?|ttf|svg|png|jpe?g|gif|webp|ico)$/

const HTML_CACHE_CONTROL = 'public, max-age=3600, stale-while-revalidate=86400'
// Vite fingerprints build output (content-hashed filenames), so an asset
// URL either changes or never changes — safe to cache for a year, and this
// holds regardless of Cookie/Set-Cookie state (no backend ever varies a
// static asset's bytes by visitor).
const ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable'
// The default. Must be set explicitly (not just "no Cache-Control") because
// an absent header still gets Cloudflare's heuristic-freshness default TTL.
const PRIVATE_CACHE_CONTROL = 'private, no-store'

/**
 * Adds a `Cache-Control` header to a Container response so Workers Cache
 * can serve repeat requests without waking the Container — or, for
 * anything that isn't a recognized-safe case, an explicit `private,
 * no-store` so Workers Cache never stores it. Leaves the response fully
 * alone for non-GET/HEAD requests (not heuristically cacheable regardless
 * of headers — RFC 9111 requires explicit freshness info to cache a
 * non-GET/HEAD method, which none of these backends set) and when the
 * backend already set its own directive.
 */
export function withCacheControl(request: Request, response: Response): Response {
  if (request.method !== 'GET' && request.method !== 'HEAD') return response
  if (response.headers.has('Cache-Control')) return response

  const { pathname } = new URL(request.url)
  const headers = new Headers(response.headers)

  // Default: do not cache. Every case below must explicitly opt in.
  let cacheControl = PRIVATE_CACHE_CONTROL

  if (ASSET_EXTENSION.test(pathname)) {
    cacheControl = ASSET_CACHE_CONTROL
  } else if (response.ok && !request.headers.has('Cookie') && !response.headers.has('Set-Cookie')) {
    // A clean 2xx exchange with no session cookie on either side. This is
    // the one non-asset case presumed safe: no auth, no per-visitor state.
    cacheControl = HTML_CACHE_CONTROL
  }

  headers.set('Cache-Control', cacheControl)

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
