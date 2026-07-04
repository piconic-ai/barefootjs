#!/usr/bin/env bun
/**
 * Dev-all proxy: expose every adapter and the main site under one origin.
 *
 *   :4000/integrations/hono/*        → hono service
 *   :4000/integrations/h3/*          → h3 service
 *   :4000/integrations/elysia/*      → elysia service
 *   :4000/integrations/echo/*        → echo service
 *   :4000/integrations/gin/*         → gin service
 *   :4000/integrations/chi/*         → chi service
 *   :4000/integrations/nethttp/*     → nethttp service
 *   :4000/integrations/mojolicious/* → mojolicious service
 *   :4000/integrations/xslate/*      → xslate service
 *   :4000/integrations/flask/*       → flask service
 *   :4000/integrations/fastapi/*     → fastapi service
 *   :4000/integrations/sinatra/*     → sinatra service
 *   :4000/integrations/rails/*       → rails service
 *   :4000/integrations/php/*         → php service
 *   :4000/*                          → site-core service
 *
 * Designed to run inside the dev docker-compose network where service names
 * (hono, h3, elysia, echo, gin, chi, nethttp, mojolicious, xslate, sinatra,
 * rails, site-core) resolve via Docker DNS. Each upstream
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
  { prefix: '/integrations/php',         target: process.env.PHP_TARGET         ?? 'http://php:3012',         label: 'PHP (Twig)' },
] as const

const DEFAULT_TARGET = process.env.SITE_CORE_TARGET ?? 'http://site-core:4001'

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
    const route = matchRoute(url.pathname)
    const target = route?.target ?? DEFAULT_TARGET
    const label = route ? route.prefix : 'site-core'

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

console.log(`dev-all proxy listening on http://localhost:${PORT}`)
for (const r of routes) {
  console.log(`  ${r.prefix.padEnd(26)} → ${r.target}`)
}
console.log(`  ${'(fallback)'.padEnd(26)} → ${DEFAULT_TARGET} (site-core)`)
