/**
 * SSR render-gap investigation, Part A hypothesis 4 (warmup/JIT asymmetry)
 * — NOT part of the product. See the investigation's PR/issue for the
 * full writeup; this script is the reproducible artifact behind the
 * "WARMUP=5 is insufficient" finding that motivated bumping WARMUP to 50
 * in bench-ssr.ts's measureServerRender.
 *
 * Method: within a single process, call each framework's real renderPage()
 * repeatedly and measure a 20-call block after 5 warmup calls (exactly
 * bench-ssr.ts's former contract), then keep calling and re-measure after
 * 105, 305, and 805 total calls. A framework that's still cooling down
 * shows a declining median across blocks; a framework already at steady
 * state by block 1 shows a flat series.
 *
 * Usage: bun benchmarks/ssr/measure-warmup-sensitivity.ts <react|solid|barefoot>
 *
 * Findings (4-core shared box, see investigation writeup for full series):
 *   react:    block1 ~22ms   -> block4 ~20.5ms  (~7% drop, near-steady by block1)
 *   solid:    block1 ~0.53ms -> block4 ~0.18ms  (~2.7x drop, NOT steady by block1)
 *   barefoot: block1 ~7.9ms  -> block4 ~5.3ms   (~1.6x drop, NOT steady by block1)
 *
 * Conclusion: the former 5-iteration warmup materially overstated solid's
 * AND barefoot's per-call cost (react was already near its floor). This is
 * a real, reproducible harness soundness issue — but correcting it does
 * NOT close the barefoot/solid gap (if anything the corrected ratio is
 * slightly larger, since solid's proportional speedup from more warmup is
 * bigger than barefoot's). It substantially closes the barefoot/react
 * ratio, though (react benefits least from extra warmup).
 */
import { join } from 'node:path'
import rows from './data.json'

const appsRoot = join(import.meta.dirname, 'apps')
const RENDER_SERVER_MODULE: Record<string, string> = {
  react: join(appsRoot, 'react', 'src', 'render-server.tsx'),
  solid: join(appsRoot, 'solid', 'src', 'render-server.ts'),
  barefoot: join(appsRoot, 'barefoot', 'lib', 'render-server.ts'),
}

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

const fw = process.argv[2] as 'react' | 'solid' | 'barefoot'
if (!fw || !RENDER_SERVER_MODULE[fw]) {
  console.error('Usage: bun measure-warmup-sensitivity.ts <react|solid|barefoot>')
  process.exit(1)
}
const mod = (await import(RENDER_SERVER_MODULE[fw])) as { renderPage: (rows: unknown) => Promise<string> }

async function block(n: number): Promise<number[]> {
  const iters: number[] = []
  for (let i = 0; i < n; i++) {
    const t0 = performance.now()
    await mod.renderPage(rows)
    iters.push(performance.now() - t0)
  }
  return iters
}

for (let i = 0; i < 5; i++) await mod.renderPage(rows)
const b1 = await block(20)

for (let i = 0; i < 100; i++) await mod.renderPage(rows)
const b2 = await block(20)

for (let i = 0; i < 200; i++) await mod.renderPage(rows)
const b3 = await block(20)

for (let i = 0; i < 500; i++) await mod.renderPage(rows)
const b4 = await block(30)

console.log(`=== ${fw} ===`)
console.log('block1 (after 5 warmup — bench-ssr.ts\'s former contract):', median(b1).toFixed(3), 'ms')
console.log('block2 (after 105 total calls):', median(b2).toFixed(3), 'ms')
console.log('block3 (after 305 total calls):', median(b3).toFixed(3), 'ms')
console.log('block4 (after 805 total calls):', median(b4).toFixed(3), 'ms')
console.log()
console.log('block1 raw:', b1.map((x) => x.toFixed(2)).join(', '))
console.log('block4 raw:', b4.map((x) => x.toFixed(2)).join(', '))
