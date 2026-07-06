/**
 * Production build for the SolidJS benchmark app.
 *
 * Pipeline: babel-preset-solid (real template compilation, same as
 * `frameworks/keyed/solid`'s rollup/babel pipeline upstream) transforms
 * src/*.tsx to plain JS, then Bun.build bundles+minifies it for the browser.
 */
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from '@babel/core'

const APP_DIR = dirname(fileURLToPath(import.meta.url))
const SRC_DIR = join(APP_DIR, 'src')
const BABEL_OUT_DIR = join(APP_DIR, '.babel-out')
const DIST_DIR = join(APP_DIR, 'dist')
const SHARED_STYLES = join(APP_DIR, '..', 'shared', 'styles.css')

const INDEX_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>BarefootJS Benchmark — Solid</title>
<link rel="stylesheet" href="./styles.css" />
</head>
<body>
<script type="module" src="./app.js"></script>
</body>
</html>
`

export async function build(): Promise<void> {
  // --- 1. transform src/*.tsx with babel-preset-solid + preset-typescript ---
  rmSync(BABEL_OUT_DIR, { recursive: true, force: true })
  mkdirSync(BABEL_OUT_DIR, { recursive: true })

  const glob = new Bun.Glob('*.tsx')
  const entryNames: string[] = []
  for await (const file of glob.scan({ cwd: SRC_DIR })) {
    const srcPath = join(SRC_DIR, file)
    const source = await Bun.file(srcPath).text()
    const result = transformSync(source, {
      filename: srcPath,
      presets: [
        ['babel-preset-solid', {}],
        ['@babel/preset-typescript', { isTSX: true, allExtensions: true }],
      ],
      babelrc: false,
      configFile: false,
    })
    if (!result?.code) throw new Error(`babel produced no output for ${file}`)
    const outName = file.replace(/\.tsx$/, '.js')
    await Bun.write(join(BABEL_OUT_DIR, outName), result.code)
    entryNames.push(outName)
  }

  const entry = join(BABEL_OUT_DIR, 'main.js')
  if (!existsSync(entry)) throw new Error(`expected entry ${entry} not found after babel transform`)

  // --- 2. bundle for production ---
  rmSync(DIST_DIR, { recursive: true, force: true })
  mkdirSync(DIST_DIR, { recursive: true })

  const result = await Bun.build({
    entrypoints: [entry],
    target: 'browser',
    format: 'esm',
    minify: true,
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    // Force the browser+production `exports` condition on solid-js so we
    // link the real DOM renderer (dist/solid.js, cloneNode templates), not
    // the SSR build (dist/server.js) or the unminified dev build.
    conditions: ['browser', 'production'],
  })

  if (!result.success) {
    for (const message of result.logs) console.error(message)
    throw new Error('Bun.build failed for solid benchmark app')
  }

  for (const artifact of result.outputs) {
    const bytes = await artifact.arrayBuffer()
    await Bun.write(join(DIST_DIR, 'app.js'), bytes)
  }

  // --- 3. static assets ---
  await Bun.write(join(DIST_DIR, 'index.html'), INDEX_HTML)
  await Bun.write(join(DIST_DIR, 'styles.css'), Bun.file(SHARED_STYLES))
}

if (import.meta.main) {
  await build()
  console.log('solid benchmark app built to', DIST_DIR)
}
