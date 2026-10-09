/**
 * Rewrites the auto-generated results block of benchmarks/README.md from
 * the JSON each bench writes to benchmarks/results/:
 *
 *   latest.json             runner/bench-dom.ts      (DOM update suite)
 *   ssr-latest.json         ssr/bench-ssr.ts         (SSR + hydration)
 *   ssr-memory-latest.json  ssr/bench-ssr-memory.ts  (post-hydration heap)
 *   reactive-latest.json    reactive.ts              (reactive primitives)
 *
 * Only the text between the `<!-- benchmark-results:start -->` and
 * `<!-- benchmark-results:end -->` markers is replaced; the prose around it
 * is hand-written and left alone. Run every bench in full first — this
 * script refuses a `--quick`, `--framework=` or `--op=` run (see
 * validate-results.ts), since those overwrite the same JSON files.
 *
 * `.github/workflows/update-benchmark-results.yml` runs the four benches and
 * this script on a schedule and opens a PR with the diff.
 *
 * Usage:
 *   bun benchmarks/runner/update-readme.ts [--dry-run]
 */
import { join } from 'node:path'
import { formatReportMd, type FullResults } from './report.ts'
import { assertCompleteDomRun, assertCompleteSsrRun } from './validate-results.ts'

const runnerDir = import.meta.dirname
const benchDir = join(runnerDir, '..')
const resultsDir = join(benchDir, 'results')
const readmePath = join(benchDir, 'README.md')

const START = '<!-- benchmark-results:start -->'
const END = '<!-- benchmark-results:end -->'

const dryRun = process.argv.slice(2).includes('--dry-run')

// ---------------------------------------------------------------------------
// Result shapes (mirrors of what each bench's writeResultsJson emits)
// ---------------------------------------------------------------------------

interface Stats {
  median: number
}

interface SsrResults {
  environment: {
    date: string
    bunVersion: string
    chromiumVersion: string
    reactVersion: string | null
    solidVersion: string | null
    cpuModel: string
    rowCount: number
  }
  results: Array<{
    framework: string
    serverRender: { iterations: number[]; stats: Stats }
    hydration: { iterations: number[]; stats: Stats }
    interactivity: { ok: boolean; reason?: string }
    payload: { clientJsRaw: number; clientJsGzip: number; htmlRaw: number; htmlGzip: number }
  }>
}

interface SsrMemoryResults {
  environment: { date: string; bunVersion: string; chromiumVersion: string }
  iterations: number
  results: Array<{ framework: string; median: number; stddev: number }>
}

interface ReactiveResults {
  environment: { date: string; bunVersion: string; solidVersion: string | null }
  rows: Array<{ label: string; bfMs: number; bfOps: number | null; solidMs: number; solidOps: number | null }>
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function loadJson<T>(name: string, producer: string): Promise<T> {
  const path = join(resultsDir, name)
  const file = Bun.file(path)
  if (!(await file.exists())) {
    throw new Error(`missing ${path} — run \`bun ${producer}\` first`)
  }
  return JSON.parse(await file.text()) as T
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function fmtMs(ms: number): string {
  if (Number.isNaN(ms)) return 'n/a'
  if (ms < 0.01) return '<0.01'
  return ms.toFixed(2)
}

function fmtBytes(n: number): string {
  return `${(n / 1024).toFixed(1)}KB`
}

function fmtDate(iso: string): string {
  return iso.slice(0, 10)
}

function ssrTable(ssr: SsrResults): string[] {
  const r = ssr.results
  const header = `| Metric | ${r.map((x) => x.framework).join(' | ')} |`
  const sep = `|---|${r.map(() => '---').join('|')}|`
  const n = (pick: (x: SsrResults['results'][number]) => number[]) =>
    Math.max(...r.map((x) => pick(x).length))
  return [
    header,
    sep,
    `| Server render (median, n=${n((x) => x.serverRender.iterations)}) | ${r
      .map((x) => `${fmtMs(x.serverRender.stats.median)} ms`)
      .join(' | ')} |`,
    `| Hydration time (median, n=${n((x) => x.hydration.iterations)}) | ${r
      .map((x) => `${fmtMs(x.hydration.stats.median)} ms`)
      .join(' | ')} |`,
    `| Interactivity gate | ${r
      .map((x) => (x.interactivity.ok ? 'PASS' : `FAILED: ${x.interactivity.reason ?? ''}`))
      .join(' | ')} |`,
    `| Client JS (raw / gzip) | ${r
      .map((x) => `${fmtBytes(x.payload.clientJsRaw)} / ${fmtBytes(x.payload.clientJsGzip)}`)
      .join(' | ')} |`,
    `| HTML document (raw / gzip) | ${r
      .map((x) => `${fmtBytes(x.payload.htmlRaw)} / ${fmtBytes(x.payload.htmlGzip)}`)
      .join(' | ')} |`,
  ]
}

function ssrMemoryTable(mem: SsrMemoryResults): string[] {
  const r = mem.results
  return [
    `| Metric | ${r.map((x) => x.framework).join(' | ')} |`,
    `|---|${r.map(() => '---').join('|')}|`,
    `| Post-hydration heap (median, n=${mem.iterations}) | ${r.map((x) => fmtBytes(x.median)).join(' | ')} |`,
    `| stdev | ${r.map((x) => fmtBytes(x.stddev)).join(' | ')} |`,
  ]
}

function reactiveTable(re: ReactiveResults): string[] {
  const ops = (n: number | null) => (n === null ? '—' : Math.round(n).toLocaleString('en-US'))
  return [
    '| Case | BarefootJS (ms) | BarefootJS (ops/sec) | SolidJS (ms) | SolidJS (ops/sec) |',
    '|---|---|---|---|---|',
    ...re.rows.map((r) => `| ${r.label} | ${r.bfMs.toFixed(3)} | ${ops(r.bfOps)} | ${r.solidMs.toFixed(3)} | ${ops(r.solidOps)} |`),
  ]
}

function renderBlock(dom: FullResults, ssr: SsrResults, mem: SsrMemoryResults, re: ReactiveResults): string {
  const env = dom.environment
  const dates = [dom.environment.date, ssr.environment.date, mem.environment.date, re.environment.date].map(fmtDate)
  const uniqueDates = [...new Set(dates)]
  const when =
    uniqueDates.length === 1
      ? `Snapshot from one full run on ${uniqueDates[0]}.`
      : `Snapshot from full runs between ${uniqueDates.slice().sort()[0]} and ${uniqueDates.slice().sort().at(-1)}.`

  return [
    START,
    '<!-- Generated by `bun benchmarks/runner/update-readme.ts` from benchmarks/results/*.json. Do not edit by hand. -->',
    '',
    `${when} Environment: headless Chromium ${env.chromiumVersion}, Bun ${env.bunVersion},`,
    `React ${env.reactVersion ?? 'n/a'}, Solid ${env.solidVersion ?? 'n/a'}, ${env.cpuModel} (containerized`,
    'CI-class hardware — rerun locally for your own numbers; ratios are the signal, wall-clock',
    'will differ).',
    '',
    '### DOM update suite (median, ×factor vs vanilla)',
    '',
    ...formatReportMd(dom),
    '',
    `### SSR + hydration (${ssr.environment.rowCount.toLocaleString('en-US')}-row table)`,
    '',
    ...ssrTable(ssr),
    '',
    '### SSR post-hydration JS heap',
    '',
    ...ssrMemoryTable(mem),
    '',
    '### Reactive primitives',
    '',
    ...reactiveTable(re),
    END,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const dom = await loadJson<FullResults>('latest.json', 'benchmarks/runner/bench-dom.ts')
  const ssr = await loadJson<SsrResults>('ssr-latest.json', 'benchmarks/ssr/bench-ssr.ts')
  const mem = await loadJson<SsrMemoryResults>('ssr-memory-latest.json', 'benchmarks/ssr/bench-ssr-memory.ts')
  const re = await loadJson<ReactiveResults>('reactive-latest.json', 'benchmarks/reactive.ts')
  assertCompleteDomRun(dom)
  assertCompleteSsrRun(ssr)

  const readme = await Bun.file(readmePath).text()
  const start = readme.indexOf(START)
  const end = readme.indexOf(END)
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`${readmePath} has no ${START} … ${END} block`)
  }

  const block = renderBlock(dom, ssr, mem, re)
  const next = readme.slice(0, start) + block + readme.slice(end + END.length)

  if (dryRun) {
    console.log(block)
    return
  }
  if (next === readme) {
    console.log('benchmarks/README.md: results block already up to date')
    return
  }
  await Bun.write(readmePath, next)
  console.log('benchmarks/README.md: results block updated')
}

await main()
