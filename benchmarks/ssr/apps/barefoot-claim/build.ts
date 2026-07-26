/**
 * Production build for the barefoot-claim Stage 0 spike app
 * (spec/slot-unification.md). Derives its SSR HTML from the real barefoot
 * SSR pipeline via ./lib/render-server.ts (which calls barefoot's real
 * renderPage then strips markers per ./lib/strip-markers.ts — see that
 * module's docstring for exactly what's elided and what's kept), and
 * bundles the hand-written claim-once client (./client/hydrate.js) as the
 * "shipped hydration JS" — no @barefootjs/client runtime included, since
 * this prototype doesn't use it (see hydrate.js's docstring for the list
 * of things a real implementation would still need that this skips).
 *
 * lib/render-server.ts transitively imports barefoot's real
 * lib/render-server.ts, which needs the @barefootjs/* + hono symlinks
 * barefoot/build.ts's ensureWorkspaceLinks() creates under
 * apps/barefoot/node_modules (gitignored, so absent on a fresh clone).
 * Build that sibling app first if those links aren't there yet — cheap to
 * skip once present, and bench-ssr.ts builds barefoot as its own framework
 * anyway so this is rarely the first thing to create them.
 */
import { mkdir, cp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build as buildBarefoot } from '../barefoot/build.ts'
import rows from '../../data.json'

const appDir = dirname(fileURLToPath(import.meta.url))
const barefootAppDir = join(appDir, '..', 'barefoot')
const distDir = join(appDir, 'dist')
const sharedStylesPath = join(appDir, '..', '..', '..', 'apps', 'shared', 'styles.css')
const clientEntry = join(appDir, 'client', 'hydrate.js')

export async function build(): Promise<void> {
  if (!existsSync(join(barefootAppDir, 'node_modules', '@barefootjs'))) {
    await buildBarefoot()
  }

  // Dynamic import, not a top-level one: this module (and everything it
  // statically imports, transitively including barefoot's real
  // lib/render-server.ts) must not be evaluated until the symlink check
  // above has run — a top-level import would resolve @barefootjs/* before
  // ensureWorkspaceLinks() had a chance to create them on a fresh clone.
  const { renderPage } = await import('./lib/render-server.ts')

  if (existsSync(distDir)) await rm(distDir, { recursive: true, force: true })
  await mkdir(distDir, { recursive: true })

  const ssrHtml = await renderPage(rows)

  const result = await Bun.build({
    entrypoints: [clientEntry],
    target: 'browser',
    format: 'esm',
    minify: true,
    naming: 'app.client.js',
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  })

  if (!result.success) {
    for (const message of result.logs) console.error(message)
    throw new Error('barefoot-claim SSR bench app build failed')
  }

  for (const output of result.outputs) {
    const bytes = await output.arrayBuffer()
    await Bun.write(join(distDir, output.path.split('/').pop()!), bytes)
  }

  await cp(sharedStylesPath, join(distDir, 'styles.css'))

  await Bun.write(
    join(distDir, 'index.html'),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>BarefootJS SSR Bench — BarefootJS (claim-once spike)</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <div id="app">${ssrHtml}</div>
    <script type="module" src="./app.client.js"></script>
  </body>
</html>
`,
  )
}

if (import.meta.main) {
  await build()
  console.log('barefoot-claim: built SSR bench to benchmarks/ssr/apps/barefoot-claim/dist')
}
