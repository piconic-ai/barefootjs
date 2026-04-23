/**
 * Compiler instrumentation counters.
 *
 * Off by default — the `if (_enabled)` guard is a nanosecond branch so the
 * hot-path cost is negligible when disabled. The bench harness
 * (packages/jsx/bench/compiler-bench.ts) toggles it on, runs a corpus
 * through compileJSX, and reads the aggregate counters.
 *
 * Scope: only instrument the sites that could become Phase 2 targets of the
 * type-based detection refactor — TypeScript Program creation, Reactive<T>
 * checker queries, and whole-file analyze calls. Anything finer grained
 * (individual node visits) belongs in a profiler, not here.
 */

export interface CompilerCounters {
  /** Number of ts.createProgram() calls via createProgramForFile(). */
  programCreations: number
  /** Number of checker.getTypeAtLocation() calls from reactivity-checker. */
  typeCheckerQueries: number
  /** Number of top-level containsReactiveExpression() calls from jsx-to-ir. */
  reactivityChecks: number
  /** Number of analyzeComponent() invocations (one per file per target). */
  filesAnalyzed: number
}

let _enabled = false
let _counters: CompilerCounters = freshCounters()

function freshCounters(): CompilerCounters {
  return {
    programCreations: 0,
    typeCheckerQueries: 0,
    reactivityChecks: 0,
    filesAnalyzed: 0,
  }
}

export function enableCompilerInstrumentation(): void {
  _enabled = true
}

export function disableCompilerInstrumentation(): void {
  _enabled = false
}

export function resetCompilerCounters(): void {
  _counters = freshCounters()
}

export function getCompilerCounters(): CompilerCounters {
  return { ..._counters }
}

export function incrementCounter(key: keyof CompilerCounters): void {
  if (_enabled) _counters[key]++
}
