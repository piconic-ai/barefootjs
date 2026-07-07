/**
 * Formatting (plain-text + markdown) and JSON persistence for bench-dom.ts
 * results. No editorializing — numbers only.
 */
import { join } from 'node:path'
import type { Stats } from './stats.ts'

export const OP_ORDER = [
  'create1k',
  'replace1k',
  'update10th',
  'select',
  'swap',
  'remove',
  'create10k',
  'append1k',
  'clear10k',
] as const

export interface OpTimingResult {
  op: string
  framework: string
  ok: boolean
  reason?: string
  iterations: number[]
  stats: Stats | null
}

export interface ExtraMetricResult {
  framework: string
  startupIterations: number[]
  startupStats: Stats
  memoryIterations: number[]
  memoryStats: Stats
}

export interface ShippedJsResult {
  framework: string
  raw: number
  gzip: number
}

export interface Environment {
  date: string
  bunVersion: string
  chromiumVersion: string
  reactVersion: string | null
  solidVersion: string | null
  cpuModel: string
}

export interface FullResults {
  environment: Environment
  frameworks: string[]
  ops: OpTimingResult[]
  extras: ExtraMetricResult[]
  shippedJs: ShippedJsResult[]
}

const BASELINE = 'vanilla'

function fmtMs(ms: number): string {
  if (Number.isNaN(ms)) return 'n/a'
  if (ms < 0.01) return '<0.01'
  return ms.toFixed(2)
}

function fmtBytes(n: number): string {
  return `${(n / 1024).toFixed(1)}KB`
}

function factorSuffix(value: number, baseline: number | undefined, isBaseline: boolean): string {
  if (isBaseline || baseline === undefined || !Number.isFinite(baseline) || baseline <= 0) return ''
  return ` (${(value / baseline).toFixed(2)}x)`
}

function findOp(results: FullResults, op: string, framework: string): OpTimingResult | undefined {
  return results.ops.find((r) => r.op === op && r.framework === framework)
}

function opCellPlain(results: FullResults, op: string, framework: string): string {
  const r = findOp(results, op, framework)
  if (!r) return 'n/a'
  if (!r.ok || !r.stats) return `FAILED${r.reason ? `: ${r.reason}` : ''}`
  const baseline = findOp(results, op, BASELINE)
  const baseMedian = baseline?.ok ? baseline.stats?.median : undefined
  const suffix = factorSuffix(r.stats.median, baseMedian, framework === BASELINE)
  return `${fmtMs(r.stats.median)}ms [${fmtMs(r.stats.q1)}–${fmtMs(r.stats.q3)}]${suffix}`
}

function opCellMd(results: FullResults, op: string, framework: string): string {
  const r = findOp(results, op, framework)
  if (!r) return '_n/a_'
  if (!r.ok || !r.stats) return `FAILED${r.reason ? ` (${r.reason})` : ''}`
  const baseline = findOp(results, op, BASELINE)
  const baseMedian = baseline?.ok ? baseline.stats?.median : undefined
  const suffix = factorSuffix(r.stats.median, baseMedian, framework === BASELINE)
  return `${fmtMs(r.stats.median)} ms${suffix}`
}

function extrasFor(results: FullResults, framework: string): ExtraMetricResult | undefined {
  return results.extras.find((e) => e.framework === framework)
}

function shippedFor(results: FullResults, framework: string): ShippedJsResult | undefined {
  return results.shippedJs.find((s) => s.framework === framework)
}

function startupCell(results: FullResults, framework: string, md: boolean): string {
  const e = extrasFor(results, framework)
  if (!e) return md ? '_n/a_' : 'n/a'
  const base = extrasFor(results, BASELINE)
  const suffix = factorSuffix(e.startupStats.median, base?.startupStats.median, framework === BASELINE)
  return md ? `${fmtMs(e.startupStats.median)} ms${suffix}` : `${fmtMs(e.startupStats.median)}ms${suffix}`
}

function memoryCell(results: FullResults, framework: string, md: boolean): string {
  const e = extrasFor(results, framework)
  if (!e) return md ? '_n/a_' : 'n/a'
  const base = extrasFor(results, BASELINE)
  const suffix = factorSuffix(e.memoryStats.median, base?.memoryStats.median, framework === BASELINE)
  return md ? `${fmtBytes(e.memoryStats.median)}${suffix}` : `${fmtBytes(e.memoryStats.median)}${suffix}`
}

function shippedCell(results: FullResults, framework: string, md: boolean): string {
  const s = shippedFor(results, framework)
  if (!s) return md ? '_n/a_' : 'n/a'
  const base = shippedFor(results, BASELINE)
  const suffix = factorSuffix(s.gzip, base?.gzip, framework === BASELINE)
  return `${fmtBytes(s.raw)} raw / ${fmtBytes(s.gzip)} gzip${suffix}`
}

export function printReport(results: FullResults, opts: { md: boolean }): void {
  const { frameworks } = results
  const rowLabel = (op: string) => op

  if (opts.md) {
    const header = `| Operation | ${frameworks.join(' | ')} |`
    const sep = `|---|${frameworks.map(() => '---').join('|')}|`
    console.log(header)
    console.log(sep)
    for (const op of OP_ORDER) {
      const cells = frameworks.map((f) => opCellMd(results, op, f))
      console.log(`| ${rowLabel(op)} | ${cells.join(' | ')} |`)
    }
    console.log(`| startup | ${frameworks.map((f) => startupCell(results, f, true)).join(' | ')} |`)
    console.log(`| memory (1k rows) | ${frameworks.map((f) => memoryCell(results, f, true)).join(' | ')} |`)
    console.log(`| shipped JS | ${frameworks.map((f) => shippedCell(results, f, true)).join(' | ')} |`)
    return
  }

  const opW = 16
  const colW = 34
  const header = 'Operation'.padEnd(opW) + frameworks.map((f) => f.padStart(colW)).join('')
  console.log('')
  console.log(header)
  console.log('-'.repeat(header.length))
  for (const op of OP_ORDER) {
    let line = rowLabel(op).padEnd(opW)
    for (const f of frameworks) line += opCellPlain(results, op, f).padStart(colW)
    console.log(line)
  }
  let startupLine = 'startup'.padEnd(opW)
  for (const f of frameworks) startupLine += startupCell(results, f, false).padStart(colW)
  console.log(startupLine)

  let memLine = 'memory (1k rows)'.padEnd(opW)
  for (const f of frameworks) memLine += memoryCell(results, f, false).padStart(colW)
  console.log(memLine)

  let shipLine = 'shipped JS'.padEnd(opW)
  for (const f of frameworks) shipLine += shippedCell(results, f, false).padStart(colW)
  console.log(shipLine)
  console.log('')
}

export async function writeResultsJson(results: FullResults, resultsDir: string): Promise<void> {
  const path = join(resultsDir, 'latest.json')
  await Bun.write(path, `${JSON.stringify(results, null, 2)}\n`)
}
