/**
 * Completeness checks for the results JSON that `update-readme.ts` publishes.
 *
 * `bench-dom.ts --framework=a,b` / `--op=x,y` and `bench-ssr.ts
 * --framework=a,b` are diagnostic reruns, but they write the same
 * `results/latest.json` / `results/ssr-latest.json` a full run does. Without
 * these checks a local rerun of one op would be published as the README
 * snapshot: one framework column, every other op `n/a`, no vanilla ratios.
 * Pure functions, no I/O, so the regression test can feed them shapes.
 */
import { type FullResults, OP_ORDER } from './report.ts'

export const EXPECTED_DOM_FRAMEWORKS = ['vanilla', 'barefoot', 'react', 'solid'] as const
export const EXPECTED_SSR_FRAMEWORKS = ['react', 'solid', 'barefoot'] as const

/**
 * `bench-dom.ts --quick` measures 3 iterations per op; a full run measures
 * 10 (5 for the stress ops create10k / append1k / clear10k). Anything under
 * the stress-op count is a quick run and must not be published.
 */
export const MIN_FULL_ITERATIONS = 5

/** The subset of `bench-ssr.ts`'s results JSON these checks read. */
export interface SsrResultsLike {
  results: Array<{ framework: string }>
}

function missing(expected: readonly string[], actual: Iterable<string>): string[] {
  const have = new Set(actual)
  return expected.filter((f) => !have.has(f))
}

/**
 * Throws unless `dom` is a full, unfiltered `bench-dom.ts` run: every
 * expected framework, every op for every framework, and full iteration
 * counts on every measured op. A FAILED op (correctness gate) still counts
 * as present — the README shows it as FAILED, which is a measured outcome.
 */
export function assertCompleteDomRun(dom: FullResults): void {
  const absent = missing(EXPECTED_DOM_FRAMEWORKS, dom.frameworks)
  if (absent.length > 0) {
    throw new Error(
      `results/latest.json is missing framework(s) ${absent.join(', ')} — a --framework= run cannot be published; rerun bench-dom.ts unfiltered`,
    )
  }
  for (const framework of EXPECTED_DOM_FRAMEWORKS) {
    const ops = new Set(dom.ops.filter((o) => o.framework === framework).map((o) => o.op))
    const absentOps = missing(OP_ORDER, ops)
    if (absentOps.length > 0) {
      throw new Error(
        `results/latest.json is missing op(s) ${absentOps.join(', ')} for ${framework} — an --op= run cannot be published; rerun bench-dom.ts unfiltered`,
      )
    }
    if (!dom.extras.some((e) => e.framework === framework)) {
      throw new Error(`results/latest.json has no startup/memory extras for ${framework}; rerun bench-dom.ts unfiltered`)
    }
    if (!dom.shippedJs.some((s) => s.framework === framework)) {
      throw new Error(`results/latest.json has no shipped-JS size for ${framework}; rerun bench-dom.ts unfiltered`)
    }
  }
  const short = dom.ops.find((o) => o.ok && o.iterations.length < MIN_FULL_ITERATIONS)
  if (short) {
    throw new Error(
      `results/latest.json looks like a --quick run (${short.op}/${short.framework} has ${short.iterations.length} iterations); rerun bench-dom.ts without --quick before publishing`,
    )
  }
}

/** Throws unless `ssr` carries every framework `bench-ssr.ts` compares. */
export function assertCompleteSsrRun(ssr: SsrResultsLike): void {
  const absent = missing(
    EXPECTED_SSR_FRAMEWORKS,
    ssr.results.map((r) => r.framework),
  )
  if (absent.length > 0) {
    throw new Error(
      `results/ssr-latest.json is missing framework(s) ${absent.join(', ')} — a --framework= run cannot be published; rerun bench-ssr.ts unfiltered`,
    )
  }
}
