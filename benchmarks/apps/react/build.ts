/**
 * Production build for the React benchmark app.
 *
 * Bundles src/main.tsx with Bun.build (production React, minified, ESM),
 * then writes dist/index.html and copies the shared stylesheet — see
 * benchmarks/CONTRACT.md for the exact output contract every app follows.
 */
import { mkdir, cp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const appDir = new URL('.', import.meta.url).pathname
const distDir = `${appDir}dist`
const sharedStylesPath = `${appDir}../shared/styles.css`

export async function build(): Promise<void> {
  if (existsSync(distDir)) {
    await rm(distDir, { recursive: true, force: true })
  }
  await mkdir(distDir, { recursive: true })

  const result = await Bun.build({
    entrypoints: [`${appDir}src/main.tsx`],
    target: 'browser',
    format: 'esm',
    minify: true,
    naming: 'app.js',
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  })

  if (!result.success) {
    for (const message of result.logs) {
      console.error(message)
    }
    throw new Error('React benchmark app build failed')
  }

  for (const output of result.outputs) {
    const bytes = await output.arrayBuffer()
    await Bun.write(`${distDir}/${output.path.split('/').pop()}`, bytes)
  }

  await cp(sharedStylesPath, `${distDir}/styles.css`)

  await Bun.write(
    `${distDir}/index.html`,
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>BarefootJS Benchmark — React</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <div id="main"></div>
    <script type="module" src="./app.js"></script>
  </body>
</html>
`,
  )
}

if (import.meta.main) {
  await build()
}
