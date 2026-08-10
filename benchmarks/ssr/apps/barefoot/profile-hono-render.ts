/**
 * SSR render-gap investigation, Part C (this file's question: PRECISELY
 * where inside hono/jsx does the ~5ms/1000-row cost go?). Standalone
 * script, not part of the product — run under Bun's built-in sampling CPU
 * profiler (`--cpu-prof --cpu-prof-md`, JavaScriptCore's real sampler, not
 * hand-rolled instrumentation) so the breakdown reflects actual wall time,
 * not a guess from reading the source.
 *
 * Renders the same fixed 1,000-row dataset (../../data.json) through the
 * real `compileJSX` + `HonoAdapter` + `renderToHtml` path (same compiled
 * component as lib/render-server.ts) MEASURE times in a tight loop so the
 * profiler's 1ms sampling interval collects enough samples in hono/jsx's
 * hot functions to resolve a percentage breakdown.
 *
 * Usage:
 *   bun --cpu-prof --cpu-prof-md --cpu-prof-name=hono-render.cpuprofile.md \
 *     benchmarks/ssr/apps/barefoot/profile-hono-render.ts
 *
 * The .md profile groups self-time by function; see the investigation
 * writeup for the extracted top-function table and file:line mapping into
 * hono's dist source (node_modules/.bun/hono@<version>/node_modules/hono).
 */
import { compileJSX } from '@barefootjs/jsx'
import { HonoAdapter } from '@barefootjs/hono/adapter'
import { renderToHtml } from '@barefootjs/hono/render'
import { readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const APP_DIR = import.meta.dirname
const COMPONENT_SRC = join(APP_DIR, 'components', 'BenchSsr.tsx')
const rows = (await import(join(APP_DIR, '..', '..', 'data.json'))).default as Array<{
  id: number
  label: string
}>

async function main() {
  const source = readFileSync(COMPONENT_SRC, 'utf8')
  const result = compileJSX(source, 'BenchSsr.tsx', { adapter: new HonoAdapter() })
  const errors = result.errors.filter((e) => e.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`BenchSsr compile errors:\n${errors.map((e) => e.message).join('\n')}`)
  }
  const markedTemplate = result.files.find((f) => f.type === 'markedTemplate')
  if (!markedTemplate) throw new Error('No marked template in BenchSsr compile output')

  const tempFile = join(APP_DIR, `.profile-compiled-${Date.now()}.tsx`)
  const code = `/** @jsxImportSource hono/jsx */\n${markedTemplate.content}`
  await Bun.write(tempFile, code)
  let component: (props: { initialRows: unknown; __instanceId: string; __bfChild: boolean }) => unknown
  try {
    const mod = await import(tempFile)
    component = mod.BenchSsr
  } finally {
    unlinkSync(tempFile)
  }

  const WARMUP = 50
  const MEASURE = 2000

  for (let i = 0; i < WARMUP; i++) {
    const node = component({ initialRows: rows, __instanceId: 'BenchSsr_bench', __bfChild: false })
    await renderToHtml(node)
  }

  const t0 = performance.now()
  for (let i = 0; i < MEASURE; i++) {
    const node = component({ initialRows: rows, __instanceId: 'BenchSsr_bench', __bfChild: false })
    await renderToHtml(node)
  }
  const elapsed = performance.now() - t0
  console.log(
    `profiled ${MEASURE} renders in ${elapsed.toFixed(1)}ms (${(elapsed / MEASURE).toFixed(3)}ms/render)`,
  )
}

await main()
