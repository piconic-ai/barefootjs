#!/usr/bin/env bun
/**
 * Dev-all proxy: expose every adapter and the main site under one origin.
 *
 *   localhost:4000/integrations/hono/*             → localhost:3001 (wrangler dev)
 *   localhost:4000/integrations/echo/*             → localhost:8080 (go run .)
 *   localhost:4000/integrations/mojolicious/*      → localhost:3004 (perl app.pl)
 *   localhost:4000/*                           → localhost:3000 (site/core)
 *
 * Each adapter mounts under /examples/<name>, so we dispatch by path prefix
 * and forward the request verbatim. Anything else falls through to site/core
 * (landing + docs). SSE and streaming responses work because Bun.serve
 * returns the upstream body stream directly without buffering.
 */

const PORT = Number(process.env.DEV_ALL_PORT ?? 4000)

type Route = {
  prefix: string
  target: string
  label: string
}

const routes: readonly Route[] = [
  { prefix: '/integrations/hono',        target: 'http://localhost:3001', label: 'Hono (Workers)' },
  { prefix: '/integrations/echo',        target: 'http://localhost:8080', label: 'Echo (Go)' },
  { prefix: '/integrations/mojolicious', target: 'http://localhost:3004', label: 'Mojolicious (Perl)' },
] as const

const DEFAULT_TARGET = 'http://localhost:3005' // site/core

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
    const label = route ? route.prefix : 'site/core'

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
        `Upstream ${target} (${label}) unreachable (${msg}). Is that dev server running?`,
        { status: 502, headers: { 'Content-Type': 'text/plain' } },
      )
    }
  },
})

console.log(`dev-all proxy listening on http://localhost:${PORT}`)
for (const r of routes) {
  console.log(`  ${r.prefix.padEnd(26)} → ${r.target}`)
}
console.log(`  ${'(fallback)'.padEnd(26)} → ${DEFAULT_TARGET} (site/core)`)
