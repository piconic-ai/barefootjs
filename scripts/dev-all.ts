#!/usr/bin/env bun
/**
 * Dev-all proxy: expose every adapter and both sites under one origin.
 *
 * `docker-compose.yml` only publishes THIS proxy's port to the host — every
 * other service is container-network-only, so a port an app logs internally
 * (Flask on 3008, Gin on 8081, ...) is never reachable directly. This proxy
 * is the one place that maps "port I saw in the logs" to "URL I can open":
 *
 *   http://localhost:4000/integrations/hono/        → hono service
 *   http://localhost:4000/integrations/h3/          → h3 service
 *   http://localhost:4000/integrations/elysia/      → elysia service
 *   http://localhost:4000/integrations/echo/        → echo service
 *   http://localhost:4000/integrations/gin/         → gin service
 *   http://localhost:4000/integrations/chi/         → chi service
 *   http://localhost:4000/integrations/nethttp/     → nethttp service
 *   http://localhost:4000/integrations/mojolicious/ → mojolicious service
 *   http://localhost:4000/integrations/xslate/      → xslate service
 *   http://localhost:4000/integrations/flask/       → flask service
 *   http://localhost:4000/integrations/fastapi/     → fastapi service
 *   http://localhost:4000/integrations/sinatra/     → sinatra service
 *   http://localhost:4000/integrations/rails/       → rails service
 *   http://localhost:4000/integrations/axum/        → axum service
 *   http://localhost:4000/integrations/php/         → php service
 *   http://localhost:4000/integrations/django/      → django service
 *   http://localhost:4000/integrations/blade/       → blade service
 *   http://localhost:4000/integrations/laravel/     → laravel service
 *   http://localhost:4000/*                         → site-core (barefootjs.dev)
 *   http://ui.localhost:4000/*                      → site-ui (ui.barefootjs.dev)
 *
 * site-ui is routed by Host header rather than a path prefix: in production
 * it is a separate origin (ui.barefootjs.dev), and its routes/asset links
 * assume they own "/", so a path prefix would need rewriting. `*.localhost`
 * resolves to 127.0.0.1 without any /etc/hosts edit in every current
 * browser (and in curl via `--resolve`).
 *
 * Designed to run inside the dev docker-compose network where service names
 * (hono, h3, elysia, echo, gin, chi, nethttp, mojolicious, xslate, sinatra,
 * rails, axum, site-core, site-ui) resolve via Docker DNS. Each upstream
 * target is overridable via env vars so the same script also works on the
 * host (e.g. when iterating on the proxy itself), and so individual targets
 * can be redirected to host.docker.internal when an integration is being run
 * outside compose for focused debugging.
 *
 * SSE and streaming responses work because Bun.serve returns the upstream
 * body stream directly without buffering.
 */

const PORT = Number(process.env.DEV_ALL_PORT ?? 4000)

type Route = {
  prefix: string
  target: string
  label: string
}

const routes: readonly Route[] = [
  { prefix: '/integrations/hono',        target: process.env.HONO_TARGET        ?? 'http://hono:3000',        label: 'Hono' },
  { prefix: '/integrations/h3',          target: process.env.H3_TARGET          ?? 'http://h3:3003',          label: 'h3 (UnJS)' },
  { prefix: '/integrations/elysia',      target: process.env.ELYSIA_TARGET      ?? 'http://elysia:3005',      label: 'Elysia (Bun)' },
  { prefix: '/integrations/echo',        target: process.env.ECHO_TARGET        ?? 'http://echo:8080',        label: 'Echo (Go)' },
  { prefix: '/integrations/gin',         target: process.env.GIN_TARGET         ?? 'http://gin:8081',         label: 'Gin (Go)' },
  { prefix: '/integrations/chi',         target: process.env.CHI_TARGET         ?? 'http://chi:8082',         label: 'Chi (Go)' },
  { prefix: '/integrations/nethttp',     target: process.env.NETHTTP_TARGET     ?? 'http://nethttp:8083',     label: 'net/http (Go)' },
  { prefix: '/integrations/mojolicious', target: process.env.MOJOLICIOUS_TARGET ?? 'http://mojolicious:3000', label: 'Mojolicious (Perl)' },
  { prefix: '/integrations/xslate',      target: process.env.XSLATE_TARGET      ?? 'http://xslate:3007',      label: 'Text::Xslate (Perl)' },
  { prefix: '/integrations/flask',       target: process.env.FLASK_TARGET       ?? 'http://flask:3008',       label: 'Flask (Python)' },
  { prefix: '/integrations/fastapi',     target: process.env.FASTAPI_TARGET     ?? 'http://fastapi:3009',     label: 'FastAPI (Python)' },
  { prefix: '/integrations/sinatra',     target: process.env.SINATRA_TARGET     ?? 'http://sinatra:3010',     label: 'Sinatra (Ruby)' },
  { prefix: '/integrations/rails',       target: process.env.RAILS_TARGET       ?? 'http://rails:3011',       label: 'Rails (Ruby)' },
  { prefix: '/integrations/axum',        target: process.env.AXUM_TARGET        ?? 'http://axum:3012',        label: 'Axum (Rust)' },
  { prefix: '/integrations/php',         target: process.env.PHP_TARGET         ?? 'http://php:3013',         label: 'PHP (Twig)' },
  { prefix: '/integrations/django',      target: process.env.DJANGO_TARGET      ?? 'http://django:3014',      label: 'Django (Python)' },
  { prefix: '/integrations/blade',       target: process.env.BLADE_TARGET       ?? 'http://blade:3015',       label: 'Blade (PHP)' },
  { prefix: '/integrations/laravel',     target: process.env.LARAVEL_TARGET     ?? 'http://laravel:3016',     label: 'Laravel (PHP)' },
] as const

const SITE_CORE_TARGET = process.env.SITE_CORE_TARGET ?? 'http://site-core:4001'
const SITE_UI_TARGET = process.env.SITE_UI_TARGET ?? 'http://site-ui:3002'

function matchRoute(pathname: string): Route | null {
  for (const route of routes) {
    if (pathname === route.prefix || pathname.startsWith(route.prefix + '/')) {
      return route
    }
  }
  return null
}

Bun.serve({
  port: PORT,
  async fetch(req): Promise<Response> {
    const url = new URL(req.url)
    const isUiHost = url.hostname.startsWith('ui.')
    const route = isUiHost ? null : matchRoute(url.pathname)
    const target = route?.target ?? (isUiHost ? SITE_UI_TARGET : SITE_CORE_TARGET)
    const label = route ? route.prefix : isUiHost ? 'site-ui' : 'site-core'

    const proxyUrl = target + url.pathname + url.search
    try {
      const upstream = await fetch(proxyUrl, {
        method: req.method,
        headers: req.headers,
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
        redirect: 'manual',
      })
      // Bun's fetch transparently decompresses gzip/brotli responses, but the
      // Content-Encoding and Content-Length headers come through unchanged.
      // Strip both so downstream browsers don't try to decompress already-
      // plain bytes (which manifests as an empty/broken response).
      const headers = new Headers(upstream.headers)
      headers.delete('content-encoding')
      headers.delete('content-length')
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return new Response(
        `Upstream ${target} (${label}) unreachable (${msg}). Is that service up? ` +
        `In single-adapter mode, only the adapter you started will respond.`,
        { status: 502, headers: { 'Content-Type': 'text/plain' } },
      )
    }
  },
})

// `docker compose up` interleaves every service's own startup log (each
// printing whatever internal port ITS framework picked — 3008, 8081, ...),
// none of which are reachable directly. This is the one line a developer
// should actually look for: every URL below is the full, open-this address.
console.log('')
console.log(`════════════════════════════════════════════════════════════════`)
console.log(`  dev-all proxy — the ONLY host-reachable port is ${PORT}`)
console.log(`  (every URL logged elsewhere by an individual service is`)
console.log(`   container-internal and cannot be opened directly)`)
console.log(`════════════════════════════════════════════════════════════════`)
const entries: Array<{ url: string; label: string }> = [
  { url: `http://localhost:${PORT}/`, label: 'site-core (barefootjs.dev)' },
  { url: `http://ui.localhost:${PORT}/`, label: 'site-ui (ui.barefootjs.dev)' },
  ...routes.map((r) => ({ url: `http://localhost:${PORT}${r.prefix}/`, label: r.label })),
]
const urlWidth = Math.max(...entries.map((e) => e.url.length)) + 2
for (const e of entries) {
  console.log(`  ${e.url.padEnd(urlWidth)}→ ${e.label}`)
}
console.log(`════════════════════════════════════════════════════════════════`)
