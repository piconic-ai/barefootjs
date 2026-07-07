/**
 * Production build for the Solid SSR bench app.
 *
 * 1. Server-renders the fixed 1,000-row dataset once via `renderPage`
 *    (render-server.ts's `generate: 'ssr'` compile of App.tsx) to produce
 *    the HTML shipped in dist/index.html, plus the `<HydrationScript/>`
 *    head tag Solid's hydration protocol requires.
 * 2. Babel-transforms App.tsx + client-entry.ts with
 *    `generate: 'dom', hydratable: true` (the CLIENT half of Solid's SSR
 *    story — see App.tsx's docstring), then bundles the result with
 *    Bun.build forcing `conditions: ['browser', 'production']` so
 *    `solid-js/web` resolves its real DOM renderer, not the SSR server
 *    build (see apps/solid/build.ts's precedent + render-server.ts's
 *    docstring on the opposite forcing for the server half).
 * 3. Writes dist/index.html embedding the pre-rendered table + row data
 *    as `window.__DATA__` + copies the shared stylesheet.
 */
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from '@babel/core'
import { renderPage, hydrationScriptTag } from './src/render-server.ts'
import rows from '../../data.json'

const APP_DIR = dirname(fileURLToPath(import.meta.url))
const SRC_DIR = join(APP_DIR, 'src')
const BABEL_OUT_DIR = join(APP_DIR, '.babel-out-dom')
const DIST_DIR = join(APP_DIR, 'dist')
const SHARED_STYLES = join(APP_DIR, '..', '..', '..', 'apps', 'shared', 'styles.css')

function babelTransformDom(filePath: string): string {
  const source = require('node:fs').readFileSync(filePath, 'utf8')
  const result = transformSync(source, {
    filename: filePath,
    presets: [
      ['babel-preset-solid', { generate: 'dom', hydratable: true }],
      ['@babel/preset-typescript', { isTSX: true, allExtensions: true }],
    ],
    babelrc: false,
    configFile: false,
  })
  if (!result?.code) throw new Error(`babel produced no output for ${filePath}`)
  return result.code
}

export async function build(): Promise<void> {
  // --- 1. server render (also exercises the SSR half for the dist HTML) ---
  const ssrHtml = await renderPage(rows)
  const hydrationScript = await hydrationScriptTag()

  // --- 2. babel-transform the DOM (client) half ---
  rmSync(BABEL_OUT_DIR, { recursive: true, force: true })
  mkdirSync(BABEL_OUT_DIR, { recursive: true })

  const appJs = babelTransformDom(join(SRC_DIR, 'App.tsx'))
  await Bun.write(join(BABEL_OUT_DIR, 'App.js'), appJs)

  const entryJs = babelTransformDom(join(SRC_DIR, 'client-entry.ts'))
  await Bun.write(join(BABEL_OUT_DIR, 'client-entry.js'), entryJs)

  // --- 3. bundle for production ---
  rmSync(DIST_DIR, { recursive: true, force: true })
  mkdirSync(DIST_DIR, { recursive: true })

  const result = await Bun.build({
    entrypoints: [join(BABEL_OUT_DIR, 'client-entry.js')],
    target: 'browser',
    format: 'esm',
    minify: true,
    naming: 'app.client.js',
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    // Force the browser+production DOM renderer (dist/solid.js — cloneNode
    // templates, hydrate, delegateEvents), not the SSR string-render build
    // (dist/server.js) that plain `bun run` resolution picks by default
    // (see render-server.ts's docstring on that opposite default).
    conditions: ['browser', 'production'],
  })

  if (!result.success) {
    for (const message of result.logs) console.error(message)
    throw new Error('Solid SSR bench app build failed')
  }

  for (const artifact of result.outputs) {
    const bytes = await artifact.arrayBuffer()
    await Bun.write(join(DIST_DIR, 'app.client.js'), bytes)
  }

  await Bun.write(join(DIST_DIR, 'styles.css'), Bun.file(SHARED_STYLES))

  await Bun.write(
    join(DIST_DIR, 'index.html'),
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>BarefootJS SSR Bench — Solid</title>
${hydrationScript}
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
  console.log('solid: built SSR bench to benchmarks/ssr/apps/solid/dist')
}
