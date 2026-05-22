/**
 * Development server for the BarefootJS site (landing page + documentation).
 * Run with: bun run --watch server.tsx
 */

import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { resolve, dirname } from 'node:path'
import { createApp } from './app'
import { loadContentFromDisk } from './lib/content-loader'

const CONTENT_DIR = resolve(dirname(import.meta.path), '../../docs/core')
const { pages, content, mdx } = await loadContentFromDisk(CONTENT_DIR)

const server = new Hono()

// Mirror the production _headers rule: the playground iframe is
// sandbox="allow-scripts" (opaque origin), so it needs CORS to import the
// runtime cross-origin.
server.use('/static/components/*', async (c, next) => {
  await next()
  c.header('Access-Control-Allow-Origin', '*')
})

// Serve compiled static files (CSS, components, icons, logos, snippets)
server.use('/static/*', serveStatic({
  root: './dist',
  rewriteRequestPath: (path) => path.replace('/static', ''),
}))

// Serve llms.txt
server.use('/llms.txt', serveStatic({
  root: './dist',
  rewriteRequestPath: () => '/llms.txt',
}))

// Mount the main app
const app = await createApp(content, pages, mdx)
server.route('/', app)

// 4000 is the dev proxy; site/core sits next to it at 4001 so the
// host-developer-facing ports are grouped. 3xxx is reserved for the
// integration adapters' natural defaults.
const port = Number(process.env.PORT) || 4001

export default {
  port,
  fetch: server.fetch,
}

console.log(`Site running at http://localhost:${port}`)
