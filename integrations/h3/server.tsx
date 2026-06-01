/** @jsxImportSource @barefootjs/hono/jsx */
//
// BarefootJS on h3 (UnJS) — SSR + client hydration.
//
// h3 is a pure HTTP framework: it has no JSX runtime, you just return a
// value from a handler. BarefootJS components compiled with the Hono
// adapter are plain `hono/jsx` components, so we render them to an HTML
// string with `renderToHtml` (no Hono app involved) and return that
// string. Static client bundles are served straight off disk.
//
// This mirrors the Go `Echo` integration: the framework (h3) lives only
// here, and the render runtime (`@barefootjs/hono`, the hono/jsx engine)
// is imported the same way Echo imports the framework-agnostic `bf`
// runtime shipped by the go-template adapter.

import { createApp, createRouter, eventHandler, getRequestPath, setResponseHeader, toNodeListener } from 'h3'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, normalize } from 'node:path'
import { renderToHtml } from '@barefootjs/hono/render'
import { Layout } from './renderer'
import manifest from './dist/components/manifest.json'
import { Counter } from '@/components/Counter'
import { Toggle } from '@/components/Toggle'

const PORT = Number(process.env.PORT ?? 3003)

// ── static assets ──────────────────────────────────────────────────────────
// /static/components/* → ./dist/components/*   (barefoot.js + *.client.js)
// /shared/styles/*     → ../shared/styles/*    (demo stylesheets)
const STATIC_MOUNTS: Array<{ prefix: string; dir: string }> = [
  { prefix: '/static/components/', dir: join(import.meta.dir, 'dist/components') },
  { prefix: '/shared/styles/', dir: join(import.meta.dir, '../shared/styles') },
]

const CONTENT_TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
}

async function tryServeStatic(path: string): Promise<{ body: Buffer; type: string } | null> {
  for (const { prefix, dir } of STATIC_MOUNTS) {
    if (!path.startsWith(prefix)) continue
    // normalize() collapses any `..` so a crafted path can't escape `dir`.
    const rel = normalize(path.slice(prefix.length))
    if (rel.startsWith('..')) return null
    const file = join(dir, rel)
    try {
      const body = await readFile(file)
      const ext = rel.slice(rel.lastIndexOf('.'))
      return { body, type: CONTENT_TYPES[ext] ?? 'application/octet-stream' }
    } catch {
      return null
    }
  }
  return null
}

// ── HTML pages ───────────────────────────────────────────────────────────
async function page(node: unknown): Promise<string> {
  return '<!DOCTYPE html>' + (await renderToHtml(node))
}

const router = createRouter()

router.get(
  '/',
  eventHandler(async () =>
    page(
      <Layout title="BarefootJS + h3" manifest={manifest}>
        <h1>BarefootJS + h3 Integration</h1>
        <nav>
          <ul>
            <li><a href="/counter">Counter</a></li>
            <li><a href="/toggle">Toggle</a></li>
          </ul>
        </nav>
      </Layout>,
    ),
  ),
)

router.get(
  '/counter',
  eventHandler(async () =>
    page(
      <Layout title="Counter — BarefootJS + h3" manifest={manifest}>
        <h1>Counter</h1>
        <Counter initial={0} />
        <p><a href="/">← Back</a></p>
      </Layout>,
    ),
  ),
)

router.get(
  '/toggle',
  eventHandler(async () =>
    page(
      <Layout title="Toggle — BarefootJS + h3" manifest={manifest}>
        <h1>Toggle</h1>
        <Toggle
          toggleItems={[
            { label: 'Setting 1', defaultOn: true },
            { label: 'Setting 2', defaultOn: false },
          ]}
        />
        <p><a href="/">← Back</a></p>
      </Layout>,
    ),
  ),
)

const app = createApp()

// Static first: short-circuit asset requests before the router runs.
app.use(
  eventHandler(async (event) => {
    const hit = await tryServeStatic(getRequestPath(event))
    if (!hit) return // fall through to the router
    setResponseHeader(event, 'Content-Type', hit.type)
    return hit.body
  }),
)

app.use(router)

createServer(toNodeListener(app)).listen(PORT, () => {
  console.log(`  ➜ http://localhost:${PORT}`)
})
