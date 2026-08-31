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
 * default), so every branch below that must not be cached sets an explicit
 * `private, no-store` rather than merely leaving the header unset. This
 * repo shipped the "just leave it unset" version once already
 * (piconic-ai/barefootjs#2784) and it cached session-specific Todo
 * responses across visitors — do not regress to that shape.
 */

const ASSET_EXTENSION = /\.(?:js|mjs|css|woff2?|ttf|svg|png|jpe?g|gif|webp|ico)$/

const HTML_CACHE_CONTROL = 'public, max-age=3600, stale-while-revalidate=86400'
// Vite fingerprints build output (content-hashed filenames), so an asset
// URL either changes or never changes — safe to cache for a year.
const ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable'
// Explicit opt-out. Must be set (not just "no Cache-Control") because an
// absent header still gets Cloudflare's heuristic-freshness default TTL.
const PRIVATE_CACHE_CONTROL = 'private, no-store'

/**
 * Adds a `Cache-Control` header to a Container response so Workers Cache
 * will store it — or explicitly opts it out with `private, no-store` when
 * it isn't safely cacheable: non-2xx, either side of the exchange carries a
 * session cookie (a `Cookie` on the request — the visitor already has a
 * session, so the body is theirs — or a `Set-Cookie` on the response — a
 * new session is being minted for them). Leaves the response fully alone
 * for non-GET/HEAD requests (not heuristically cacheable regardless of
 * headers) and when the backend already set its own directive.
 */
export function withCacheControl(request: Request, response: Response): Response {
  if (request.method !== 'GET' && request.method !== 'HEAD') return response
  if (response.headers.has('Cache-Control')) return response

  const isUncacheable = !response.ok || request.headers.has('Cookie') || response.headers.has('Set-Cookie')

  const { pathname } = new URL(request.url)
  const headers = new Headers(response.headers)
  headers.set(
    'Cache-Control',
    isUncacheable ? PRIVATE_CACHE_CONTROL : ASSET_EXTENSION.test(pathname) ? ASSET_CACHE_CONTROL : HTML_CACHE_CONTROL,
  )

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
