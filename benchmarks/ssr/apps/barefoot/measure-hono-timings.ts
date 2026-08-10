/**
 * SSR render-gap investigation, item 4 (cross-adapter comparison):
 * Hono's half of the WARMUP=50 / MEASURE=2000 methodology also used by
 * go-render-bench/main.go and twig-render-bench/bench.php, so the three
 * adapters' numbers are comparable apples-to-apples (same dataset, same
 * warmup depth, same iteration count, same "one long-lived process,
 * discard-and-retime" shape). Standalone script, not part of the product.
 *
 * Writes hono-timings.json (a JSON array of per-call elapsed ms, same
 * shape as the Go/PHP benches' timings.json) plus a one.html sample for
 * the row-count/byte-size parity check documented in the investigation
 * writeup.
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

  const tempFile = join(APP_DIR, `.measure-compiled-${Date.now()}.tsx`)
  const code = `/** @jsxImportSource hono/jsx */\n${markedTemplate.content}`
  await Bun.write(tempFile, code)
  let component: (props: { initialRows: unknown; __instanceId: string; __bfChild: boolean }) => unknown
  try {
    const mod = await import(tempFile)
    component = mod.BenchSsr
  } finally {
    unlinkSync(tempFile)
  }

  const render = async () => {
    const node = component({ initialRows: rows, __instanceId: 'BenchSsr_bench', __bfChild: false })
    return renderToHtml(node)
  }

  const one = await render()
  await Bun.write(join(APP_DIR, 'one.html'), one)
  const rowCount = (one.match(/<tr/g) ?? []).length
  console.log(`rows(<tr): ${rowCount}, bytes: ${one.length}, has bf-p: ${one.includes('bf-p')}`)

  const WARMUP = 50
  const MEASURE = 2000

  for (let i = 0; i < WARMUP; i++) await render()

  const iterations: number[] = []
  for (let i = 0; i < MEASURE; i++) {
    const t0 = performance.now()
    await render()
    iterations.push(performance.now() - t0)
  }

  await Bun.write(join(APP_DIR, 'hono-timings.json'), JSON.stringify(iterations))
  console.log('wrote hono-timings.json')
}

await main()
