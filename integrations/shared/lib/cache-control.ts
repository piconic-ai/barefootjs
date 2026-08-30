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
 */

const ASSET_EXTENSION = /\.(?:js|mjs|css|woff2?|ttf|svg|png|jpe?g|gif|webp|ico)$/

const HTML_CACHE_CONTROL = 'public, max-age=3600, stale-while-revalidate=86400'
// Vite fingerprints build output (content-hashed filenames), so an asset
// URL either changes or never changes — safe to cache for a year.
const ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable'

/**
 * Adds a `Cache-Control` header to a Container response so Workers Cache
 * will store it. Leaves the response alone when it isn't safely cacheable:
 * non-GET/HEAD, non-2xx, the backend already set its own directive, or
 * either side of the exchange carries a session cookie (a `Cookie` on the
 * request — the visitor already has a session, so the body is theirs — or a
 * `Set-Cookie` on the response — a new session is being minted for them).
 */
export function withCacheControl(request: Request, response: Response): Response {
  if (request.method !== 'GET' && request.method !== 'HEAD') return response
  if (!response.ok) return response
  if (response.headers.has('Cache-Control')) return response
  if (request.headers.has('Cookie')) return response
  if (response.headers.has('Set-Cookie')) return response

  const { pathname } = new URL(request.url)
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', ASSET_EXTENSION.test(pathname) ? ASSET_CACHE_CONTROL : HTML_CACHE_CONTROL)

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
