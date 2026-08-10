/**
 * SSR render-gap investigation, item 4 (provenance for the Go bench):
 * regenerates dumped-template.tmpl / dumped-types.go — the VERBATIM output
 * of GoTemplateAdapter compiling ../components/BenchSsr.tsx, dumped for
 * reference. Standalone script, not part of the product.
 *
 * Usage (run once `bun benchmarks/ssr/apps/barefoot/build.ts` has created
 * this app's node_modules/@barefootjs/* symlinks — see that file's
 * ensureWorkspaceLinks docstring):
 *
 *   bun benchmarks/ssr/apps/barefoot/go-render-bench/dump-template.ts
 *
 * `main.go` / `types.go` in this directory are hand-adjusted copies of
 * this dump (package renamed `main`, the redundant `math/rand` import
 * stripped since main.go defines its own `randomID`) wired to Go's real
 * production entry point (`bf.Renderer.RenderFragment`, not the bare
 * `tmpl.ExecuteTemplate` the adapter-conformance harness uses) — re-diff
 * against a fresh dump here after any GoTemplateAdapter change that
 * touches this component shape.
 */
import { compileJSX } from '@barefootjs/jsx'
import { GoTemplateAdapter } from '../../../../../packages/adapter-go-template/src/adapter/index.ts'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT_DIR = import.meta.dirname
const source = readFileSync(join(OUT_DIR, '..', 'components', 'BenchSsr.tsx'), 'utf8')

const adapter = new GoTemplateAdapter()
const result = compileJSX(source, 'BenchSsr.tsx', { adapter, outputIR: true })
const errors = result.errors.filter((e) => e.severity === 'error')
if (errors.length) {
  console.error(errors)
  process.exit(1)
}
const template = result.files.find((f) => f.type === 'markedTemplate')!
const irFile = result.files.find((f) => f.type === 'ir')!
const ir = JSON.parse(irFile.content)
const types = adapter.generateTypes!(ir)!

await Bun.write(join(OUT_DIR, 'dumped-template.tmpl'), template.content)
await Bun.write(join(OUT_DIR, 'dumped-types.go'), types)
console.log('wrote', template.content.length, 'bytes template,', types.length, 'bytes types')
