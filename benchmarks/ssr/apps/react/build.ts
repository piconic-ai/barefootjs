/**
 * Production build for the React SSR bench app.
 *
 * 1. Server-renders the fixed 1,000-row dataset once via `renderPage`
 *    (react-dom/server, production mode) to produce the HTML shipped in
 *    dist/index.html — the same HTML a real SSR request would return.
 * 2. Bundles the hydration client entry with Bun.build (production react,
 *    minified, ESM) — this is the "shipped hydration JS".
 * 3. Writes dist/index.html embedding the pre-rendered markup + the row
 *    data as `window.__DATA__` (standard React SSR data-delivery pattern)
 *    + copies the shared stylesheet.
 */
import { mkdir, cp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderPage } from './src/render-server.tsx'
import rows from '../../data.json'

const appDir = dirname(fileURLToPath(import.meta.url))
const distDir = join(appDir, 'dist')
const sharedStylesPath = join(appDir, '..', '..', '..', 'apps', 'shared', 'styles.css')

export async function build(): Promise<void> {
  if (existsSync(distDir)) {
    await rm(distDir, { recursive: true, force: true })
  }
  await mkdir(distDir, { recursive: true })

  const ssrHtml = await renderPage(rows)

  const result = await Bun.build({
    entrypoints: [join(appDir, 'src', 'client-entry.tsx')],
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
    throw new Error('React SSR bench app build failed')
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
    <title>BarefootJS SSR Bench — React</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <div id="app">${ssrHtml}</div>
    <script>window.__DATA__ = ${JSON.stringify(rows)}</script>
    <script type="module" src="./app.client.js"></script>
  </body>
</html>
`,
  )
}

if (import.meta.main) {
  await build()
  console.log('react: built SSR bench to benchmarks/ssr/apps/react/dist')
}
