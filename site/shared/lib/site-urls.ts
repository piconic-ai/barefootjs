/**
 * barefootjs.dev and ui.barefootjs.dev are separate origins in production.
 * In dev (`bun run dev` at the repo root → docker-compose's dev-all proxy,
 * scripts/dev-all.ts), both are reached through one origin (:4000):
 * site-core at the root, site-ui by Host header at ui.localhost:4000 —
 * site-ui's own routes/asset links assume they own "/", so a path prefix
 * would need rewriting that a Host match avoids. A bare `bun run dev` run
 * directly inside site/core or site/ui (vite dev, no docker-compose)
 * instead binds each site to its own port with no proxy in front: 4001 for
 * site-core (site/core/server.tsx), 3002 for site-ui (site/ui/server.tsx).
 *
 * `c.req.url`'s host reflects the incoming Host header (Bun's Request.url
 * is built from it, not from the process's own bind address), so it tells
 * you which of the two dev setups above is actually serving the request.
 */

function isDevHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname.endsWith('.localhost')
}

/** Link to barefootjs.dev (site-core), given the current request's URL. */
export function resolveCoreHref(requestUrl: URL, path = '/'): string {
  if (!isDevHost(requestUrl.hostname)) return `https://barefootjs.dev${path}`
  return requestUrl.port === '4000' ? `http://localhost:4000${path}` : `http://localhost:4001${path}`
}

/** Link to ui.barefootjs.dev (site-ui), given the current request's URL. */
export function resolveUiHref(requestUrl: URL, path = '/'): string {
  if (!isDevHost(requestUrl.hostname)) return `https://ui.barefootjs.dev${path}`
  return requestUrl.port === '4000' ? `http://ui.localhost:4000${path}` : `http://localhost:3002${path}`
}
