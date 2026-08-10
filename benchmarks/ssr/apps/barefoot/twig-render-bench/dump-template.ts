/**
 * SSR render-gap investigation, item 4 (provenance for the Twig bench):
 * regenerates bench_ssr.twig — the VERBATIM output of TwigAdapter compiling
 * ../components/BenchSsr.tsx, no hand-editing needed (unlike the Go bench's
 * types.go). Standalone script, not part of the product.
 *
 * Usage (run once `bun benchmarks/ssr/apps/barefoot/build.ts` has created
 * this app's node_modules/@barefootjs/* symlinks — see that file's
 * ensureWorkspaceLinks docstring):
 *
 *   bun benchmarks/ssr/apps/barefoot/twig-render-bench/dump-template.ts
 */
import { compileJSX } from '@barefootjs/jsx'
import { TwigAdapter } from '../../../../../packages/adapter-twig/src/adapter/index.ts'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT_DIR = import.meta.dirname
const source = readFileSync(join(OUT_DIR, '..', 'components', 'BenchSsr.tsx'), 'utf8')

const adapter = new TwigAdapter()
const result = compileJSX(source, 'BenchSsr.tsx', { adapter, outputIR: true })
const errors = result.errors.filter((e) => e.severity === 'error')
if (errors.length) {
  console.error(errors)
  process.exit(1)
}
const template = result.files.find((f) => f.type === 'markedTemplate')!

await Bun.write(join(OUT_DIR, 'bench_ssr.twig'), template.content)
console.log('wrote', template.content.length, 'bytes twig template')
