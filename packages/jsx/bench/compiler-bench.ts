#!/usr/bin/env bun
/**
 * Compiler instrumentation benchmark.
 *
 * Measures the cost profile of the current analyzer + JSX->IR pipeline
 * against a realistic corpus (site/ui components by default). Purpose:
 * establish a baseline before migrating to type-based reactive primitive
 * detection so we can judge whether the move is affordable.
 *
 * What is counted:
 * - filesAnalyzed     — total analyzeComponent() invocations
 * - programCreations  — ts.createProgram() calls (expensive, ~hundreds of ms each)
 * - reactivityChecks  — containsReactiveExpression() entry-point calls
 * - typeCheckerQueries — checker.getTypeAtLocation() calls inside the reactivity analyzer
 * - wall time per file and aggregate
 *
 * Usage:
 *   bun packages/jsx/bench/compiler-bench.ts                       # site/ui corpus (default)
 *   bun packages/jsx/bench/compiler-bench.ts --corpus <glob-dir>   # custom corpus
 *   bun packages/jsx/bench/compiler-bench.ts --limit 50            # process first N files
 *   bun packages/jsx/bench/compiler-bench.ts --top 10              # print N slowest files
 *
 * All figures are wall-clock on the calling machine. Compare deltas, not
 * absolute values across hosts.
 */

import { resolve, relative } from 'path'
import { readdir, stat } from 'fs/promises'
import {
  compileJSXSync,
  enableCompilerInstrumentation,
  disableCompilerInstrumentation,
  resetCompilerCounters,
  getCompilerCounters,
  type CompilerCounters,
} from '../src/index'
import { TestAdapter } from '../src/adapters/test-adapter'

interface FileResult {
  filePath: string
  wallTimeMs: number
  programCreated: boolean
  typeCheckerQueries: number
  reactivityChecks: number
  errors: number
}

async function findTsxFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await findTsxFiles(full)))
    } else if (entry.name.endsWith('.tsx') && !entry.name.includes('.test.') && !entry.name.includes('.preview.')) {
      out.push(full)
    }
  }
  return out
}

function parseArgs(argv: string[]): { corpus: string; limit: number; top: number } {
  const defaultCorpus = resolve(__dirname, '../../../site/ui/components')
  let corpus = defaultCorpus
  let limit = Infinity
  let top = 10
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--corpus' && argv[i + 1]) corpus = resolve(argv[++i])
    else if (arg === '--limit' && argv[i + 1]) limit = Number(argv[++i])
    else if (arg === '--top' && argv[i + 1]) top = Number(argv[++i])
  }
  return { corpus, limit, top }
}

async function main() {
  const { corpus, limit, top } = parseArgs(process.argv)

  const corpusStat = await stat(corpus).catch(() => null)
  if (!corpusStat || !corpusStat.isDirectory()) {
    console.error(`Corpus directory not found: ${corpus}`)
    process.exit(1)
  }

  const allFiles = await findTsxFiles(corpus)
  const files = allFiles.slice(0, limit)
  if (files.length === 0) {
    console.error(`No .tsx files found under ${corpus}`)
    process.exit(1)
  }

  const adapter = new TestAdapter()
  const results: FileResult[] = []
  let totalErrors = 0

  enableCompilerInstrumentation()
  const overallStart = performance.now()

  for (const filePath of files) {
    const source = await Bun.file(filePath).text()

    resetCompilerCounters()
    const before: CompilerCounters = getCompilerCounters()
    const t0 = performance.now()
    let errors = 0
    try {
      const result = compileJSXSync(source, filePath, { adapter })
      errors = result.errors.filter((e) => e.severity === 'error').length
    } catch (e) {
      errors = 1
    }
    const t1 = performance.now()
    const after = getCompilerCounters()

    const delta = {
      programCreations: after.programCreations - before.programCreations,
      typeCheckerQueries: after.typeCheckerQueries - before.typeCheckerQueries,
      reactivityChecks: after.reactivityChecks - before.reactivityChecks,
    }

    results.push({
      filePath,
      wallTimeMs: t1 - t0,
      programCreated: delta.programCreations > 0,
      typeCheckerQueries: delta.typeCheckerQueries,
      reactivityChecks: delta.reactivityChecks,
      errors,
    })
    totalErrors += errors
  }

  const overallMs = performance.now() - overallStart
  disableCompilerInstrumentation()

  const totals = results.reduce(
    (acc, r) => {
      acc.wallTimeMs += r.wallTimeMs
      acc.programsCreated += r.programCreated ? 1 : 0
      acc.typeCheckerQueries += r.typeCheckerQueries
      acc.reactivityChecks += r.reactivityChecks
      return acc
    },
    { wallTimeMs: 0, programsCreated: 0, typeCheckerQueries: 0, reactivityChecks: 0 }
  )

  const avgMs = totals.wallTimeMs / results.length
  const p50 = percentile(results.map((r) => r.wallTimeMs), 0.5)
  const p95 = percentile(results.map((r) => r.wallTimeMs), 0.95)
  const p99 = percentile(results.map((r) => r.wallTimeMs), 0.99)

  console.log('=== BarefootJS Compiler Benchmark ===')
  console.log(`Corpus:               ${corpus}`)
  console.log(`Files compiled:       ${results.length} / ${allFiles.length} found`)
  console.log(`Errors during build:  ${totalErrors}`)
  console.log('')
  console.log('--- Aggregate ---')
  console.log(`Overall wall time:    ${overallMs.toFixed(1)} ms`)
  console.log(`Sum of per-file time: ${totals.wallTimeMs.toFixed(1)} ms`)
  console.log(`Avg per file:         ${avgMs.toFixed(2)} ms`)
  console.log(`p50:                  ${p50.toFixed(2)} ms`)
  console.log(`p95:                  ${p95.toFixed(2)} ms`)
  console.log(`p99:                  ${p99.toFixed(2)} ms`)
  console.log('')
  console.log('--- Type resolution activity ---')
  console.log(`ts.createProgram calls:        ${totals.programsCreated} files (${((totals.programsCreated / results.length) * 100).toFixed(1)}%)`)
  console.log(`containsReactiveExpression():  ${totals.reactivityChecks} calls total`)
  console.log(`checker.getTypeAtLocation():   ${totals.typeCheckerQueries} calls total`)
  if (totals.reactivityChecks > 0) {
    console.log(`Avg queries per reactivity check: ${(totals.typeCheckerQueries / totals.reactivityChecks).toFixed(1)}`)
  }
  console.log('')

  const slowest = [...results].sort((a, b) => b.wallTimeMs - a.wallTimeMs).slice(0, top)
  console.log(`--- Top ${top} slowest files ---`)
  for (const r of slowest) {
    const rel = relative(corpus, r.filePath)
    const flags = [
      r.programCreated ? 'Program' : '       ',
      r.typeCheckerQueries > 0 ? `${r.typeCheckerQueries}q` : '',
      r.reactivityChecks > 0 ? `${r.reactivityChecks}rc` : '',
    ]
      .filter(Boolean)
      .join(' ')
    console.log(`${r.wallTimeMs.toFixed(1).padStart(7)} ms  ${flags.padEnd(20)}  ${rel}`)
  }
  console.log('')

  const programFiles = results.filter((r) => r.programCreated)
  if (programFiles.length > 0) {
    const programTotal = programFiles.reduce((acc, r) => acc + r.wallTimeMs, 0)
    const programAvg = programTotal / programFiles.length
    const noProgramTotal = totals.wallTimeMs - programTotal
    const noProgramAvg = noProgramTotal / (results.length - programFiles.length)
    console.log('--- Program cost isolation ---')
    console.log(`With Program creation (n=${programFiles.length}):    avg ${programAvg.toFixed(2)} ms  (total ${programTotal.toFixed(1)} ms)`)
    console.log(`Without Program creation (n=${results.length - programFiles.length}): avg ${noProgramAvg.toFixed(2)} ms  (total ${noProgramTotal.toFixed(1)} ms)`)
    console.log(`Implied per-Program overhead:    ${(programAvg - noProgramAvg).toFixed(1)} ms`)
  }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length))
  return sorted[idx]
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
