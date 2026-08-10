/**
 * SSR render-gap investigation, Part B supplement — NOT part of the
 * product.
 *
 * Explains the GC-variance signature behind the props-payload cost
 * measured in measure-props-cost.ts. The bf-p attribute value is produced
 * in two steps at hono-adapter.ts:621 (codegen) + hono/jsx's runtime
 * stringification:
 *   1. JSON.stringify(__hydrateProps) — plain, cheap, low-variance.
 *   2. hono's escapeToBuffer (node_modules/hono/dist/utils/html.js) —
 *      generic HTML-attribute escaping (`/[&<>'"]/`) applied to the JSON
 *      string. Reimplemented verbatim below (same algorithm, same
 *      char-code switch) since it's not separately exported for direct
 *      import/timing.
 *
 * JSON output has a very high quote density (every object key and every
 * string value is `"`-delimited), so this generic escape pass does one
 * `buffer[0] += str.substring(...) + '&quot;'` string allocation per
 * quote character — thousands of small allocations for the 1000-row
 * payload. That's why this step (not JSON.stringify itself) is the
 * GC-variance-heavy half of the props cost.
 *
 * Usage: bun benchmarks/ssr/apps/barefoot/measure-props-escape-variance.ts
 *
 * Findings (4-core shared box, n=100, see investigation writeup):
 *   JSON.stringify:  median ~0.10ms, tight (0.06-0.2ms, occasional ~1ms outlier)
 *   escapeToBuffer:  median ~1.0-1.1ms, WIDE (0.18-3.7ms — a ~20x spread)
 * This matches the cross-run CI observation that barefoot's SERVER RENDER
 * number is by far the noisiest of the three frameworks (5.57-8.84ms
 * across 3 CI runs vs solid's 0.47-0.53ms and react's tight 20.57-21.32ms)
 * — allocation/GC-sensitive work (this escape loop) varies with heap
 * state and machine load in a way steady CPU-bound work does not.
 *
 * Classification: the escape step is INCIDENTAL and optimizable — it is
 * generic HTML-attribute escaping applied to a value that is ALREADY
 * valid JSON (a much narrower grammar: only `"` needs escaping for
 * correctness inside a double-quoted HTML attribute, and JSON never
 * emits literal `<`/`>`/`&`/`'` in punctuation position — only inside
 * already-quoted string values, which the generic scan re-discovers on
 * every render). A JSON-aware serializer that escapes as it stringifies
 * (single pass, no separate generic re-scan) is a plausible target, but
 * is NOT implemented here per the investigation's scope (characterize,
 * don't speculatively optimize).
 */
import rows from '../../data.json'

const escapeRe = /[&<>'"]/
function escapeToBuffer(str: string, buffer: [string]): void {
  const match = str.search(escapeRe)
  if (match === -1) {
    buffer[0] += str
    return
  }
  let escape: string
  let index: number
  let lastIndex = 0
  for (index = match; index < str.length; index++) {
    switch (str.charCodeAt(index)) {
      case 34: escape = '&quot;'; break
      case 39: escape = '&#39;'; break
      case 38: escape = '&amp;'; break
      case 60: escape = '&lt;'; break
      case 62: escape = '&gt;'; break
      default: continue
    }
    buffer[0] += str.substring(lastIndex, index) + escape
    lastIndex = index + 1
  }
  buffer[0] += str.substring(lastIndex, index)
}

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
function range(arr: number[]): [number, number] {
  return [Math.min(...arr), Math.max(...arr)]
}

const WARMUP = 10
const MEASURE = 100

for (let i = 0; i < WARMUP; i++) {
  const hydrateProps = { initialRows: rows }
  const json = JSON.stringify(hydrateProps)
  const buf: [string] = ['']
  escapeToBuffer(json, buf)
}

const stringifyIters: number[] = []
const escapeIters: number[] = []
let jsonLen = 0
let escapedLen = 0

for (let i = 0; i < MEASURE; i++) {
  const hydrateProps = { initialRows: rows }
  const t0 = performance.now()
  const json = JSON.stringify(hydrateProps)
  const t1 = performance.now()
  const buf: [string] = ['']
  escapeToBuffer(json, buf)
  const t2 = performance.now()
  stringifyIters.push(t1 - t0)
  escapeIters.push(t2 - t1)
  jsonLen = json.length
  escapedLen = buf[0].length
}

const [sMin, sMax] = range(stringifyIters)
const [eMin, eMax] = range(escapeIters)
console.log('raw JSON length:', jsonLen, '  escaped (bf-p attribute) length:', escapedLen)
console.log()
console.log(`JSON.stringify:  median ${median(stringifyIters).toFixed(3)}ms  range [${sMin.toFixed(3)}, ${sMax.toFixed(3)}]`)
console.log(`escapeToBuffer:  median ${median(escapeIters).toFixed(3)}ms  range [${eMin.toFixed(3)}, ${eMax.toFixed(3)}]  (${(eMax / eMin).toFixed(1)}x spread)`)
