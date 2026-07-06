/**
 * Production build for the vanilla JS reference app.
 * Bundles `src/main.ts` to a minified ESM `dist/app.js`, and copies the
 * app's `index.html` plus the shared `styles.css` into `dist/`.
 */
import { join } from 'node:path'

const appDir = import.meta.dirname

export async function build(): Promise<void> {
  const outdir = join(appDir, 'dist')

  const result = await Bun.build({
    entrypoints: [join(appDir, 'src/main.ts')],
    outdir,
    target: 'browser',
    format: 'esm',
    minify: true,
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    naming: 'app.js',
  })

  if (!result.success) {
    for (const log of result.logs) console.error(log)
    throw new Error('vanilla: build failed')
  }

  await Bun.write(join(outdir, 'index.html'), Bun.file(join(appDir, 'index.html')))
  await Bun.write(join(outdir, 'styles.css'), Bun.file(join(appDir, '../shared/styles.css')))
}

if (import.meta.main) {
  await build()
  console.log('vanilla: built to benchmarks/apps/vanilla/dist')
}
