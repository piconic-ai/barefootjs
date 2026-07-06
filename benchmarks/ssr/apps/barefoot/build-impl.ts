/**
 * Production build for the BarefootJS SSR bench app (implementation).
 *
 * Run via build.ts, which first recreates the local node_modules symlinks
 * this module's import graph needs (`@barefootjs/*`, `hono`) and then
 * executes this file in a fresh process — Bun caches module resolution per
 * process, so links created mid-process would not be picked up here.
 *
 * 1. Server-renders the fixed 1,000-row dataset once via `renderPage`
 *    (lib/render-server.ts's real `compileJSX` + `HonoAdapter` pipeline)
 *    to produce the HTML shipped in dist/index.html — including the
 *    `bf-p` prop-hydration attribute, the framework's real SSR->client
 *    data channel (no hand-optimized alternative).
 * 2. Writes the compiled clientJs (from the same compile pass) alongside
 *    a small hydration-timing wrapper, then bundles both with the
 *    `@barefootjs/client/runtime` via Bun.build — this is the "shipped
 *    hydration JS".
 * 3. Writes dist/index.html + copies the shared stylesheet.
 */
import { mkdir, cp, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderPage, getClientJs } from './lib/render-server.ts'
import rows from '../../data.json'

const appDir = dirname(fileURLToPath(import.meta.url))
const distDir = join(appDir, 'dist')
const buildTempDir = join(appDir, '.build-temp')
const sharedStylesPath = join(appDir, '..', '..', '..', 'apps', 'shared', 'styles.css')

/**
 * Hydration entry wrapper — bundled together with the compiled
 * `BenchSsr.client.js`. `hydrate-start` is marked before the *dynamic*
 * import of `BenchSsr.client.js`, mirroring the "mark before the
 * .client.js import" contract (benchmarks/PLAN.md's SSR bench design):
 * that import's module-body side effect IS the `hydrate('BenchSsr', ...)`
 * registration call, so the timed window includes it, the same way the
 * React/Solid entries' mark precedes their `hydrateRoot`/`hydrate()`
 * call. `flushHydration()` drains the microtask+rAF-scheduled walk
 * synchronously right after, giving a deterministic completion point
 * instead of racing the framework's default (async) scheduler.
 */
const CLIENT_ENTRY_WRAPPER = `import { flushHydration } from '@barefootjs/client/runtime'

async function main() {
  performance.mark('hydrate-start')
  await import('./BenchSsr.client.js')
  flushHydration()
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      performance.mark('hydrate-end')
      performance.measure('hydrate', 'hydrate-start', 'hydrate-end')
      document.body.dataset.hydrated = '1'
    })
  })
}

main()
`

export async function build(): Promise<void> {
  if (existsSync(distDir)) await rm(distDir, { recursive: true, force: true })
  await mkdir(distDir, { recursive: true })

  const ssrHtml = await renderPage(rows)
  const clientJs = await getClientJs()

  await rm(buildTempDir, { recursive: true, force: true })
  await mkdir(buildTempDir, { recursive: true })
  await writeFile(join(buildTempDir, 'BenchSsr.client.js'), clientJs)
  await writeFile(join(buildTempDir, 'client-entry.js'), CLIENT_ENTRY_WRAPPER)

  const result = await Bun.build({
    entrypoints: [join(buildTempDir, 'client-entry.js')],
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
    throw new Error('BarefootJS SSR bench app build failed')
  }

  for (const output of result.outputs) {
    const bytes = await output.arrayBuffer()
    await Bun.write(join(distDir, output.path.split('/').pop()!), bytes)
  }

  await rm(buildTempDir, { recursive: true, force: true })

  await cp(sharedStylesPath, join(distDir, 'styles.css'))

  await Bun.write(
    join(distDir, 'index.html'),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>BarefootJS SSR Bench — BarefootJS</title>
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
  console.log('barefoot: built SSR bench to benchmarks/ssr/apps/barefoot/dist')
}
