/**
 * Bundle the browser-side router bootstrap (`router-entry.js`) into
 * `dist/client/` next to the `bf build`-emitted `barefoot.js`, so the single
 * static base (`/integrations/xslate/client/`) the PSGI app serves carries
 * everything the blog page loads.
 *
 * `@barefootjs/client*` is kept external so it resolves through the page's
 * import map to the same `barefoot.js` the compiled islands use — one reactive
 * runtime instance, so `searchParams()` is a single shared signal and the
 * router's `__bf_pushSearch` push reaches the islands' effects. The router core
 * and `@barefootjs/shared` are inlined.
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const CLIENT_EXTERNAL = [
  '@barefootjs/client',
  '@barefootjs/client/runtime',
  '@barefootjs/client/reactive',
]

async function bundle(entry: string, external: string[], label: string): Promise<void> {
  const result = await Bun.build({
    entrypoints: [resolve(ROOT, entry)],
    outdir: resolve(ROOT, 'dist/client'),
    format: 'esm',
    target: 'browser',
    external,
    minify: true,
  })
  if (!result.success) {
    for (const log of result.logs) console.error(log)
    process.exit(1)
  }
  console.log(`Generated: ${label}`)
}

await bundle('client/router-entry.ts', CLIENT_EXTERNAL, 'client/router-entry.js')
