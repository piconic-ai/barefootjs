/**
 * Bundle the browser-side glue the import map points at, next to `barefoot.js`
 * so one static base (`/static/components/`) serves everything:
 *
 *   - router-signals.js — `@barefootjs/router/signals` as a SINGLE shared
 *     module. Both the compiled `PostList` island and the bootstrap resolve
 *     `@barefootjs/router/signals` to this one file (via the import map), so
 *     there is exactly one `searchParams()` signal and one `__bf_set_search`
 *     seam. Splitting it would give the router and the island different
 *     `searchString` signals and break reactivity.
 *   - router-entry.js — the bootstrap (`setupStreaming` + `startRouter`).
 *
 * `@barefootjs/client*` and `@barefootjs/router/signals` are kept external so
 * they resolve through the import map to the shared instances; the router core
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
    outdir: resolve(ROOT, 'dist/components'),
    format: 'esm',
    target: 'browser',
    external,
  })
  if (!result.success) {
    for (const log of result.logs) console.error(log)
    process.exit(1)
  }
  console.log(`Generated: ${label}`)
}

await bundle('client/router-signals.ts', CLIENT_EXTERNAL, 'components/router-signals.js')
await bundle(
  'client/router-entry.ts',
  [...CLIENT_EXTERNAL, '@barefootjs/router/signals'],
  'components/router-entry.js',
)
