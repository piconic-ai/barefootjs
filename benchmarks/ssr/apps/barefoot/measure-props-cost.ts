/**
 * SSR render-gap investigation, Part B (where does barefoot's SSR time
 * go?) — NOT part of the product.
 *
 * Ablates the two things barefoot's compiled render function does that
 * react/solid's renderPage() do NOT do inline (see hono-adapter.ts:605-621
 * for the props-serialization codegen, and renderElement's hydrationAttrs
 * block ~741-778 for the marker codegen):
 *   1. bf-p props payload: JSON.stringify(__hydrateProps) + hono/jsx's
 *      generic HTML-escape of the result when it's embedded as an
 *      attribute value.
 *   2. Hydration markers: bf-s/bf-r/bf="sN" attributes, data-key, and the
 *      bfComment/bfText/bfTextEnd() calls that emit <!--bf:sN--> / <!--/-->
 *      comment markers around each patchable slot.
 *
 * ./measure-props-cost-variants/*.tsx are four hand-derived variants of
 * the real compiled BenchSsr output (verified against `compileJSX` output
 * — see render-server.ts's `ensureCompiled`):
 *   - variant-full:        both props + markers (matches production output)
 *   - variant-no-props:    markers only, bf-p removed
 *   - variant-no-markers:  props only, all markers removed
 *   - variant-minimal:     neither (closest structural analogue to what
 *                           react/solid's renderPage() produces — and
 *                           IS byte-identical to react's output, see
 *                           measure-structural-parity.ts)
 *
 * Methodology note: standalone per-variant timing (call ONE variant
 * repeatedly, like the real bench does) is too noisy on a shared box to
 * subtract reliably — GC pauses and scheduler jitter don't line up
 * between separate process runs. Instead this script INTERLEAVES two
 * variants within the same process (alternating calls, many rounds) so
 * shared noise hits both equally and cancels in the per-round diff. Both
 * variants get 150 rounds of combined warmup first — bare 5-10 rounds
 * measurably UNDER-states the marginal costs here too (see
 * measure-warmup-sensitivity.ts's finding that barefoot's own render path
 * needs ~100+ calls to reach JIT steady state).
 *
 * Usage: bun benchmarks/ssr/apps/barefoot/measure-props-cost.ts [variantA] [variantB]
 *   (defaults to variant-full vs variant-minimal — the combined cost)
 *
 * Findings (4-core shared box, multiple trials, see investigation writeup):
 *   base structural render (variant-minimal):  ~5.6-6.6ms (dominant, ~75-85%)
 *   + hydration markers (no-props - minimal):  ~1.6-1.9ms (~20-25%)
 *   + props payload (no-markers - minimal):    ~0.5-0.6ms (~7-8%)
 *   full - minimal (combined):                 ~1.3-1.6ms (~17-20%)
 * (markers + props sub-costs sum to slightly more than the combined delta
 * — consistent with measurement noise, not a contradiction; both isolated
 * deltas and the combined delta agree on the same ordering and rough
 * magnitude across repeated trials.)
 *
 * The initial lead ("~70KB bf-p may be a large share of the 8.84ms") does
 * NOT hold up: props serialization is real but a MINORITY cost. The
 * dominant cost is hono/jsx's per-element JSXNode allocation + recursive
 * .toString() tree-walking for 1000 rows — the same category of work
 * solid's compiler eliminates via precomputed static string-chunk
 * templates (see solid's compiled `_$ssr(_tmpl$, ...)` output, dumped by
 * apps/solid/dump-compiled-ssr.ts).
 */
import { renderToHtml } from '@barefootjs/hono/render'
import rows from '../../data.json'

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
function trimmedMean(arr: number[], trim: number): number {
  const s = [...arr].sort((a, b) => a - b)
  const k = Math.floor(s.length * trim)
  const kept = s.slice(k, s.length - k)
  return kept.reduce((a, b) => a + b, 0) / kept.length
}

const variantA = process.argv[2] ?? 'variant-full'
const variantB = process.argv[3] ?? 'variant-minimal'

const modA = (await import(`./measure-props-cost-variants/${variantA}.tsx`)) as {
  BenchSsr: (props: Record<string, unknown>) => unknown
}
const modB = (await import(`./measure-props-cost-variants/${variantB}.tsx`)) as {
  BenchSsr: (props: Record<string, unknown>) => unknown
}

async function renderOnce(mod: { BenchSsr: (props: Record<string, unknown>) => unknown }): Promise<number> {
  const t0 = performance.now()
  const node = mod.BenchSsr({ initialRows: rows, __instanceId: 'BenchSsr_bench', __bfChild: false })
  await renderToHtml(node)
  return performance.now() - t0
}

const WARMUP = 150
for (let i = 0; i < WARMUP; i++) {
  await renderOnce(modA)
  await renderOnce(modB)
}

const ROUNDS = 300
const aTimes: number[] = []
const bTimes: number[] = []
const diffs: number[] = []
for (let i = 0; i < ROUNDS; i++) {
  const a = await renderOnce(modA)
  const b = await renderOnce(modB)
  aTimes.push(a)
  bTimes.push(b)
  diffs.push(a - b)
}

console.log(`A = ${variantA}, B = ${variantB}  (${ROUNDS} interleaved rounds after ${WARMUP}-round warmup)`)
console.log('A median:', median(aTimes).toFixed(3), 'ms  | trimmed-mean(10%):', trimmedMean(aTimes, 0.1).toFixed(3), 'ms')
console.log('B median:', median(bTimes).toFixed(3), 'ms  | trimmed-mean(10%):', trimmedMean(bTimes, 0.1).toFixed(3), 'ms')
console.log('per-round (A-B) median:', median(diffs).toFixed(3), 'ms')
console.log('per-round (A-B) trimmed-mean(10%):', trimmedMean(diffs, 0.1).toFixed(3), 'ms')
const sumA = aTimes.reduce((a, b) => a + b, 0)
const sumB = bTimes.reduce((a, b) => a + b, 0)
console.log('sum(A)-sum(B) / rounds:', ((sumA - sumB) / ROUNDS).toFixed(3), 'ms/round avg')
