/**
 * BarefootJS Components Server (Bun)
 *
 * Development server using Bun runtime.
 * For production deployment to Cloudflare Workers, see worker.ts.
 */

import { initHighlighter } from './components/shared/highlighter'

// Initialize syntax highlighter at startup
await initHighlighter()

import { serveStatic } from 'hono/bun'
import { createApp } from './routes'

const app = createApp()

// Serve llms.txt
app.use('/llms.txt', serveStatic({
  root: './dist',
  rewriteRequestPath: () => '/llms.txt',
}))

// Client chunks live at dist/static/components/ (Vite's build.outDir),
// matching the production URL space exactly — no rewrite. Registered
// before the generic /static/* rule below so it wins.
app.use('/static/components/*', serveStatic({ root: './dist' }))

// Static file serving (Bun-specific)
app.use('/static/*', serveStatic({
  root: './dist',
  rewriteRequestPath: (path) => path.replace('/static', ''),
}))

// CORS + cache headers for registry (matches _headers for production)
app.use('/r/*', async (c, next) => {
  await next()
  c.header('Access-Control-Allow-Origin', '*')
  c.header('Access-Control-Allow-Methods', 'GET, OPTIONS')
  c.header('Cache-Control', 'public, max-age=300')
})

// Registry routes - serve static JSON files
app.use('/r/*', serveStatic({
  root: './dist',
}))

const port = Number(process.env.PORT) || 3002

export default { port, fetch: app.fetch }
