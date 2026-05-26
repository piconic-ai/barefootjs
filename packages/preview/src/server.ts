// Simple static file server for preview (no Hono dependency).

import { resolve, extname } from 'node:path'

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

export function startServer(distDir: string, port: number) {
  Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url)
      const pathname = url.pathname === '/' ? '/index.html' : url.pathname
      const filePath = resolve(distDir, '.' + pathname)

      const file = Bun.file(filePath)
      if (!await file.exists()) {
        return new Response('Not Found', { status: 404 })
      }

      const ext = extname(filePath)
      const contentType = MIME_TYPES[ext] || 'application/octet-stream'

      return new Response(file, {
        headers: { 'Content-Type': contentType },
      })
    },
  })

  console.log(`\nPreview server running at http://localhost:${port}`)
}
