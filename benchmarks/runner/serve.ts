/**
 * Static file server for benchmark app dist/ directories.
 * Maps `/<app>/...` -> `benchmarks/apps/<app>/dist/...`.
 */
import { extname, join, normalize } from 'node:path'

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
}

export interface ServerHandle {
  port: number
  stop: () => void
}

export function startServer(port = 0): ServerHandle {
  const appsRoot = join(import.meta.dirname, '../apps')

  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url)
      const parts = url.pathname.split('/').filter(Boolean)
      if (parts.length === 0) return new Response('Not found', { status: 404 })

      const [app, ...restParts] = parts
      const rest = restParts.length ? restParts.join('/') : 'index.html'

      // Guard against path traversal outside the app's dist dir.
      const distDir = join(appsRoot, app, 'dist')
      const filePath = normalize(join(distDir, rest))
      if (!filePath.startsWith(distDir)) return new Response('Forbidden', { status: 403 })

      const file = Bun.file(filePath)
      if (!(await file.exists())) return new Response('Not found', { status: 404 })

      const type = CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream'
      return new Response(file, {
        headers: {
          'Content-Type': type,
          'Cache-Control': 'no-store',
        },
      })
    },
  })

  return {
    port: server.port,
    stop: () => server.stop(true),
  }
}

if (import.meta.main) {
  const handle = startServer(Number(process.env.PORT) || 0)
  console.log(`Serving benchmark apps on http://localhost:${handle.port}`)
}
