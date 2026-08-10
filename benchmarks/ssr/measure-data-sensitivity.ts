/**
 * SSR render-gap investigation, Part A hypothesis 2 (caching/memoization
 * across iterations) — NOT part of the product.
 *
 * bench-ssr.ts's measureServerRender calls renderPage(rows) with the SAME
 * `rows` object on every one of its 20 measured iterations. If any
 * framework's SSR path memoizes output keyed on that object's identity or
 * content, its reported time would be an artifact, not real per-call
 * render cost. Test: render with a FRESH buildData(1000) array (new
 * objects, same shape, different string/id content) on every iteration and
 * compare medians against the same-object condition. A caching framework
 * would show a large ratio; a framework doing real per-call work should
 * show ~1.0.
 *
 * Usage: bun benchmarks/ssr/measure-data-sensitivity.ts <react|solid|barefoot>
 *
 * Findings (4-core shared box, see investigation writeup): all three
 * frameworks show fresh/same ratios in the ~0.7-1.1 range (i.e. noise-
 * dominated, no systematic slowdown from fresh data) — hypothesis 2 is
 * REFUTED for all three. Solid's speed is not a caching artifact.
 */
import { join } from 'node:path'
import { buildData } from '../apps/shared/data.ts'
import fixedRows from './data.json'

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
  console.error('Usage: bun measure-data-sensitivity.ts <react|solid|barefoot>')
  process.exit(1)
}
const mod = (await import(RENDER_SERVER_MODULE[fw])) as { renderPage: (rows: unknown) => Promise<string> }

const WARMUP = 50 // matches the corrected bench-ssr.ts warmup
const MEASURE = 30

for (let i = 0; i < WARMUP; i++) await mod.renderPage(fixedRows)
const sameDataIters: number[] = []
for (let i = 0; i < MEASURE; i++) {
  const t0 = performance.now()
  await mod.renderPage(fixedRows)
  sameDataIters.push(performance.now() - t0)
}

for (let i = 0; i < WARMUP; i++) await mod.renderPage(buildData(1000))
const freshDataIters: number[] = []
for (let i = 0; i < MEASURE; i++) {
  const freshRows = buildData(1000)
  const t0 = performance.now()
  await mod.renderPage(freshRows)
  freshDataIters.push(performance.now() - t0)
}

console.log(`=== ${fw} ===`)
console.log('SAME data median:', median(sameDataIters).toFixed(3), 'ms')
console.log('FRESH data median:', median(freshDataIters).toFixed(3), 'ms')
console.log('ratio (fresh/same):', (median(freshDataIters) / median(sameDataIters)).toFixed(2))
