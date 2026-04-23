#!/usr/bin/env bun
/**
 * Compiler instrumentation benchmark.
 *
 * Measures the cost profile of the current analyzer + JSX->IR pipeline
 * against a realistic corpus (site/ui components by default). Supports
 * three measurement modes so we can compare amortization strategies
 * head-to-head before committing to a refactor.
 *
 * Modes:
 *   baseline — stock behavior; Program only for files passing needsTypeBasedDetection
 *   forced   — every file gets its own fresh Program (worst case, no amortization)
 *   shared   — build ONE Program with all files as roots, reuse it for every compile
 *
 * What is counted (via instrumentation.ts):
 * - filesAnalyzed      — analyzeComponent() invocations
 * - programCreations   — ts.createProgram() calls (expensive)
 * - reactivityChecks   — containsReactiveExpression() entry-point calls
 * - typeCheckerQueries — checker.getTypeAtLocation() calls inside the analyzer
 *
 * Usage:
 *   bun packages/jsx/bench/compiler-bench.ts
 *   bun packages/jsx/bench/compiler-bench.ts --mode forced
 *   bun packages/jsx/bench/compiler-bench.ts --mode shared
 *   bun packages/jsx/bench/compiler-bench.ts --mode all        # run every mode in sequence
 *   bun packages/jsx/bench/compiler-bench.ts --corpus <dir> --limit 50 --top 20
 *
 * All figures are wall-clock on the calling machine. Compare deltas, not
 * absolute values across hosts.
 */

import ts from 'typescript'
import { resolve, relative, dirname } from 'path'
import { readdir, stat } from 'fs/promises'
import {
  compileJSXSync,
  createProgramForFile,
  enableCompilerInstrumentation,
  disableCompilerInstrumentation,
  resetCompilerCounters,
  getCompilerCounters,
  type CompilerCounters,
} from '../src/index'
import { TestAdapter } from '../src/adapters/test-adapter'

type Mode = 'baseline' | 'forced' | 'shared'

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

function parseArgs(argv: string[]): { corpus: string; limit: number; top: number; mode: Mode | 'all' } {
  const defaultCorpus = resolve(__dirname, '../../../site/ui/components')
  let corpus = defaultCorpus
  let limit = Infinity
  let top = 10
  let mode: Mode | 'all' = 'baseline'
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--corpus' && argv[i + 1]) corpus = resolve(argv[++i])
    else if (arg === '--limit' && argv[i + 1]) limit = Number(argv[++i])
    else if (arg === '--top' && argv[i + 1]) top = Number(argv[++i])
    else if (arg === '--mode' && argv[i + 1]) {
      const val = argv[++i]
      if (val !== 'baseline' && val !== 'forced' && val !== 'shared' && val !== 'all') {
        console.error(`Invalid --mode: ${val}. Expected baseline|forced|shared|all.`)
        process.exit(1)
      }
      mode = val
    }
  }
  return { corpus, limit, top, mode }
}

/**
 * Build one ts.Program with every corpus file as a root. The cost of this
 * single construction is what matters for the "shared Program" strategy —
 * once built, per-file queries through its checker are much cheaper than
 * spinning up 196 independent Programs.
 */
function buildSharedProgram(files: string[]): { program: ts.Program; constructionMs: number } {
  const rootDir = dirname(files[0])
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    baseUrl: rootDir,
    allowJs: false,
    esModuleInterop: true,
  }
  const t0 = performance.now()
  const program = ts.createProgram(files, compilerOptions)
  const t1 = performance.now()
  return { program, constructionMs: t1 - t0 }
}

async function runMode(mode: Mode, files: string[], top: number): Promise<void> {
  const adapter = new TestAdapter()
  const results: FileResult[] = []
  let totalErrors = 0
  let sharedProgramConstructionMs = 0
  let sharedProgram: ts.Program | undefined

  if (mode === 'shared') {
    const built = buildSharedProgram(files)
    sharedProgram = built.program
    sharedProgramConstructionMs = built.constructionMs
  }

  enableCompilerInstrumentation()
  resetCompilerCounters()
  const overallStart = performance.now()

  for (const filePath of files) {
    const source = await Bun.file(filePath).text()

    const before: CompilerCounters = getCompilerCounters()
    const t0 = performance.now()
    let errors = 0
    let program: ts.Program | undefined
    try {
      if (mode === 'forced') {
        // Every file pays the Program cost — measures worst case.
        const result = createProgramForFile(source, filePath)
        program = result?.program
      } else if (mode === 'shared') {
        program = sharedProgram
      }
      const result = compileJSXSync(source, filePath, { adapter, program })
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
      programCreated: delta.programCreations > 0 || mode === 'forced' || mode === 'shared',
      typeCheckerQueries: delta.typeCheckerQueries,
      reactivityChecks: delta.reactivityChecks,
      errors,
    })
    totalErrors += errors
  }

  const overallMs = performance.now() - overallStart
  disableCompilerInstrumentation()

  printReport(mode, files, results, overallMs, totalErrors, sharedProgramConstructionMs, top)
}

function printReport(
  mode: Mode,
  files: string[],
  results: FileResult[],
  overallMs: number,
  totalErrors: number,
  sharedProgramConstructionMs: number,
  top: number,
): void {

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

  console.log(`=== Mode: ${mode} ===`)
  console.log(`Files compiled:       ${results.length} / ${files.length} given`)
  console.log(`Errors during build:  ${totalErrors}`)
  if (mode === 'shared') {
    console.log(`Shared Program construction: ${sharedProgramConstructionMs.toFixed(1)} ms`)
  }
  console.log('')
  console.log('--- Aggregate ---')
  console.log(`Overall wall time:    ${overallMs.toFixed(1)} ms`)
  if (mode === 'shared') {
    console.log(`  + Program build:    ${sharedProgramConstructionMs.toFixed(1)} ms (one-time)`)
    console.log(`  = Total build cost: ${(overallMs + sharedProgramConstructionMs).toFixed(1)} ms`)
  }
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
  const corpusRoot = dirname(files[0] ?? '')
  console.log(`--- Top ${top} slowest files ---`)
  for (const r of slowest) {
    const rel = relative(corpusRoot, r.filePath)
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
  if (programFiles.length > 0 && programFiles.length < results.length) {
    const programTotal = programFiles.reduce((acc, r) => acc + r.wallTimeMs, 0)
    const programAvg = programTotal / programFiles.length
    const noProgramTotal = totals.wallTimeMs - programTotal
    const noProgramAvg = noProgramTotal / (results.length - programFiles.length)
    console.log('--- Program cost isolation ---')
    console.log(`With Program (n=${programFiles.length}):        avg ${programAvg.toFixed(2)} ms  (total ${programTotal.toFixed(1)} ms)`)
    console.log(`Without Program (n=${results.length - programFiles.length}):     avg ${noProgramAvg.toFixed(2)} ms  (total ${noProgramTotal.toFixed(1)} ms)`)
    console.log(`Implied per-Program overhead:    ${(programAvg - noProgramAvg).toFixed(1)} ms`)
    console.log('')
  }
}

async function main() {
  const { corpus, limit, top, mode } = parseArgs(process.argv)

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

  console.log('=== BarefootJS Compiler Benchmark ===')
  console.log(`Corpus:               ${corpus}`)
  console.log(`Files available:      ${allFiles.length}`)
  console.log(`Files to compile:     ${files.length}`)
  console.log('')

  const modes: Mode[] = mode === 'all' ? ['baseline', 'forced', 'shared'] : [mode]
  for (const m of modes) {
    await runMode(m, files, top)
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
