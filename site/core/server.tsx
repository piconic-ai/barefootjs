/**
 * Development server for the BarefootJS site (landing page + documentation).
 * Run with: bun run --watch server.tsx
 */

import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { appendTrailingSlash } from 'hono/trailing-slash'
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

// Client chunks + the standalone runtime live at dist/static/components/
// (Vite's build.outDir), matching the production URL space exactly — no
// rewrite. Registered before the generic /static/* rule below so it wins.
server.use('/static/components/*', serveStatic({ root: './dist' }))

// Serve compiled static files (CSS, icons, logos, snippets)
server.use('/static/*', serveStatic({
  root: './dist',
  rewriteRequestPath: (path) => path.replace('/static', ''),
}))

// Each deck's index.html links its own assets with relative paths
// (peitho.css, assets/deck.js), which only resolve correctly when the
// browser's URL ends in a slash. Production's Cloudflare Workers Assets
// auto-redirects a trailing-slash-less directory request before serving its
// index.html; hono/bun's serveStatic below does not (it 200s /slides/<slug>
// with the deck's own index.html, never 404ing), so appendTrailingSlash's
// default (redirect-on-404-only) never fires — `alwaysRedirect` plus a
// `skip` for asset paths (which must NOT gain a trailing slash) is needed
// to match production's behavior here.
server.use('/slides/*', appendTrailingSlash({
  alwaysRedirect: true,
  skip: (path) => /\.\w+$/.test(path),
}))

// Serve built slide decks (e.g. public/slides/overview/ from `bun run slides:build`,
// copied to dist/slides/ by build.ts) — mirrors how Cloudflare Workers Assets
// serves dist/ at the site root in production.
server.use('/slides/*', serveStatic({ root: './dist' }))

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
