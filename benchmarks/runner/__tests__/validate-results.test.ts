/**
 * Regression test for the completeness checks behind `update-readme.ts`:
 * a filtered or quick diagnostic rerun of bench-dom.ts / bench-ssr.ts
 * overwrites the same results JSON a full run writes, and must be refused
 * rather than published as the README snapshot.
 *
 * Runs in benchmark.yml (`bun test benchmarks/runner`).
 */
import { describe, expect, test } from 'bun:test'
import type { FullResults, OpTimingResult } from '../report.ts'
import {
  assertCompleteDomRun,
  assertCompleteSsrRun,
  EXPECTED_DOM_FRAMEWORKS,
  EXPECTED_SSR_FRAMEWORKS,
  MIN_FULL_ITERATIONS,
} from '../validate-results.ts'
import { OP_ORDER } from '../report.ts'

const STRESS_OPS = new Set(['create10k', 'append1k', 'clear10k'])

function stats(median: number) {
  return { median, min: median, max: median, q1: median, q3: median, mean: median, stddev: 0 }
}

function op(name: string, framework: string, iterations: number): OpTimingResult {
  return {
    op: name,
    framework,
    ok: true,
    iterations: Array.from({ length: iterations }, () => 1),
    stats: stats(1),
  }
}

/** The shape a full, unfiltered `bench-dom.ts` run writes. */
function fullDomRun(): FullResults {
  const frameworks = [...EXPECTED_DOM_FRAMEWORKS]
  return {
    environment: {
      date: '2026-10-08T00:00:00.000Z',
      bunVersion: '1.4.2',
      chromiumVersion: '141.0.0.0',
      reactVersion: '19.3.0',
      solidVersion: '1.9.17',
      cpuModel: 'test',
    },
    frameworks,
    ops: frameworks.flatMap((f) => OP_ORDER.map((o) => op(o, f, STRESS_OPS.has(o) ? 5 : 10))),
    extras: frameworks.map((f) => ({
      framework: f,
      startupIterations: [1, 1, 1, 1, 1],
      startupStats: stats(1),
      memoryIterations: [1, 1, 1],
      memoryStats: stats(1),
    })),
    shippedJs: frameworks.map((f) => ({ framework: f, raw: 1, gzip: 1 })),
  }
}

describe('assertCompleteDomRun', () => {
  test('accepts a full unfiltered run', () => {
    expect(() => assertCompleteDomRun(fullDomRun())).not.toThrow()
  })

  test('accepts a run where an op FAILED its correctness gate', () => {
    const run = fullDomRun()
    const failed = run.ops.find((o) => o.op === 'swap' && o.framework === 'react')!
    Object.assign(failed, { ok: false, reason: 'rows rebuilt', iterations: [], stats: null })
    expect(() => assertCompleteDomRun(run)).not.toThrow()
  })

  test('rejects a --framework= run (missing comparison columns)', () => {
    const run = fullDomRun()
    run.frameworks = ['barefoot']
    run.ops = run.ops.filter((o) => o.framework === 'barefoot')
    run.extras = run.extras.filter((e) => e.framework === 'barefoot')
    run.shippedJs = run.shippedJs.filter((s) => s.framework === 'barefoot')
    expect(() => assertCompleteDomRun(run)).toThrow(/missing framework\(s\) vanilla, react, solid/)
  })

  test('rejects an --op= run (missing operations)', () => {
    const run = fullDomRun()
    run.ops = run.ops.filter((o) => o.op === 'update10th')
    expect(() => assertCompleteDomRun(run)).toThrow(/missing op\(s\) create1k, replace1k/)
  })

  test('rejects a --quick run (too few iterations)', () => {
    const run = fullDomRun()
    for (const o of run.ops) o.iterations = o.iterations.slice(0, MIN_FULL_ITERATIONS - 2)
    expect(() => assertCompleteDomRun(run)).toThrow(/looks like a --quick run/)
  })

  test('rejects a run without the startup/memory extras', () => {
    const run = fullDomRun()
    run.extras = run.extras.filter((e) => e.framework !== 'solid')
    expect(() => assertCompleteDomRun(run)).toThrow(/no startup\/memory extras for solid/)
  })
})

describe('assertCompleteSsrRun', () => {
  test('accepts a full run', () => {
    expect(() =>
      assertCompleteSsrRun({ results: EXPECTED_SSR_FRAMEWORKS.map((framework) => ({ framework })) }),
    ).not.toThrow()
  })

  test('rejects a --framework= run', () => {
    expect(() => assertCompleteSsrRun({ results: [{ framework: 'barefoot' }] })).toThrow(
      /missing framework\(s\) react, solid/,
    )
  })
})
