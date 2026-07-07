/**
 * Reactive-primitives micro-benchmark: BarefootJS vs SolidJS
 * ============================================================
 *
 * Measures raw signal/effect/memo performance for the two frameworks that
 * share this paradigm (fine-grained, push-based reactive graphs with plain
 * function-call signal access, no VDOM). Run with:
 *
 *   bun benchmarks/reactive.ts [--md]
 *
 * Timing environment: this is bun/JSC single-thread wall-clock timing
 * (`performance.now()`), NOT a browser. There is no DOM, no paint, no GC
 * pressure from a rendering tree — it measures the reactive graph in
 * isolation. Treat these numbers as "cost of the primitive", not as a proxy
 * for real app frame budgets (see `benchmarks/PLAN.md` for the browser-driven
 * DOM-update suite, which is the paint-inclusive counterpart).
 *
 * React is deliberately excluded
 * -------------------------------
 * React has no standalone signal/effect primitive comparable to
 * `createSignal`/`createEffect` — its reactivity is component re-render +
 * reconciliation, not a fine-grained dependency graph. Benchmarking React
 * here would mean hand-rolling something React was never designed to do
 * (e.g. calling `useState`'s setter outside a component), which would be a
 * strawman in either direction. React is covered elsewhere in this repo's
 * benchmark suite (DOM-update suite, SSR/hydration), where its actual
 * execution model is exercised idiomatically.
 *
 * Choosing Solid's primitive: createComputed, not createEffect
 * ---------------------------------------------------------------
 * BarefootJS's `createEffect` (`packages/client/src/reactive.ts`) runs its
 * body immediately on creation and re-runs it *synchronously, inline* inside
 * `set()` — no microtask, no scheduler tick, `batch()` is opt-in. To compare
 * fairly we need the Solid primitive with the same synchronous contract.
 *
 * Solid's `createEffect` is out: its first run — and every subsequent
 * re-run — is queued onto a "user effects" queue that Solid defers (via
 * `runUserEffects`/microtask scheduling) even for the very first execution.
 * Verified empirically: a freshly-created `createEffect` has run zero times
 * immediately after creation in this harness.
 *
 * Between the two synchronous alternatives, `createComputed` and
 * `createRenderEffect`, only one is actually synchronous in the harness
 * shape this file uses (each case scoped to `createRoot(...)`, writes
 * happening *inside* that root's still-executing callback — see
 * "Methodology" below). Solid's internal scheduler defers non-pure
 * computations (`createRenderEffect`, `createEffect`) to the end of the
 * *outermost* currently-executing update — which, when the write happens
 * inside the same synchronous `createRoot` callback that created the
 * effect, means "after the callback returns", not "right when `set()` is
 * called". Measured directly in this file's exact harness shape (1000
 * unbatched writes to one subscriber, inside one `createRoot` call, checked
 * before the root callback returns):
 *
 *   createComputed:     1000 of 1000 writes visible synchronously
 *   createRenderEffect:    1 of 1000 writes visible synchronously
 *                          (the other 999 are silently deferred until
 *                          the *whole case* finishes — i.e. never observed
 *                          by code inside the case at all)
 *
 * `createComputed` is a *pure* computation in Solid's scheduler: its
 * propagation queue (`Updates`) is flushed unconditionally at the end of
 * every `runUpdates` call, regardless of nesting depth, which is exactly
 * BarefootJS's "no batching unless you opt in" contract. `createRenderEffect`
 * would silently collapse most of this file's write-loops into a single
 * deferred run and produce numbers that look implausibly fast for the wrong
 * reason (near-zero cost because almost nothing actually re-ran). The
 * sanity check below (`--- Sanity Check ---`) and the per-case effect-run
 * assertions exist specifically to catch this class of mistake, for either
 * library, in the future.
 *
 * A second, unrelated gotcha this file works around: bun/node resolve the
 * bare `"solid-js"` specifier through the package's `exports` map to
 * `dist/server.cjs` — Solid's SSR entry — under the default `node`/`import`
 * conditions. That build's signals are inert: `createSignal` returns a
 * plain get/set pair with no subscriber graph, and computations run their
 * initial synchronous pass and never again (fine for one-shot server
 * rendering, useless for a reactivity benchmark). This file imports the
 * production browser bundle directly, `solid-js/dist/solid.js`, to exercise
 * Solid's real client-side fine-grained graph. (Confirmed versions:
 * solid-js 1.9.14 at the repo root.)
 *
 * Methodology
 * -----------
 * - Each case runs in its own `createRoot(...)`, disposed when the case
 *   finishes (or, for case 1, once per timed sample — see below).
 * - Warmup: 5 calls discarded. Timed: median of 20 (or the case's stated
 *   iteration count) via the existing `measure()` helper.
 * - Case 1 (signal creation) re-creates its own root and disposes it on
 *   every timed sample, because the operation under test *is* allocation —
 *   reusing one root across samples would just measure cumulative-heap
 *   growth. Every other case creates its signals/effects once per case and
 *   the timed loop only performs the operation being measured (read/write/
 *   fan-out/etc.).
 * - `--md` prints the results table as GitHub-flavored markdown; otherwise
 *   plain fixed-width text. No editorializing in the numbers — this file
 *   prints what it measures, nothing is framed as a win or a loss.
 */

import {
  createSignal,
  createEffect,
  createMemo,
  createRoot,
  batch,
} from '../packages/client/src/index.ts'

// See "A second, unrelated gotcha" above: importing the browser production
// bundle directly, bypassing the `exports` map's node/server default.
// `createComputed` is aliased to `sCreateEffect` because it plays the role
// `createEffect` plays on the BarefootJS side of every case below (see
// "Choosing Solid's primitive" above for why `createComputed`, not
// `createEffect` or `createRenderEffect`, is the fair match).
import {
  createSignal as sCreateSignal,
  createComputed as sCreateEffect,
  createMemo as sCreateMemo,
  createRoot as sCreateRoot,
  batch as sBatch,
} from 'solid-js/dist/solid.js'

// ---------------------------------------------------------------------------
// CLI / output mode
// ---------------------------------------------------------------------------

const MD = process.argv.includes('--md')

// ---------------------------------------------------------------------------
// Measurement helpers
// ---------------------------------------------------------------------------

function measure(fn: () => void, iterations = 20): number {
  for (let i = 0; i < 5; i++) fn()

  const times: number[] = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    fn()
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)
  return times[Math.floor(times.length / 2)]!
}

function note(message: string): void {
  console.log(`  NOTE: ${message}`)
}

/**
 * Compares an observed effect-run count against what synchronous,
 * fine-grained propagation predicts. Prints a factual note (not a thrown
 * assertion) on mismatch — this is a regression guard for the primitive
 * choice above, not a claim about which framework is "better".
 */
function verifySync(caseLabel: string, lib: string, expected: number, actual: number): void {
  if (actual !== expected) {
    note(`${lib} — ${caseLabel}: effect ran ${actual} time(s), expected ${expected} for synchronous propagation in this harness.`)
  }
}

// ---------------------------------------------------------------------------
// Results table
// ---------------------------------------------------------------------------

interface Row {
  label: string
  bfMs: number
  bfOps: number | null
  solidMs: number
  solidOps: number | null
}

const rows: Row[] = []

function record(label: string, bfMs: number, solidMs: number, opsPerRun?: number): void {
  rows.push({
    label,
    bfMs,
    bfOps: opsPerRun ? (opsPerRun / bfMs) * 1000 : null,
    solidMs,
    solidOps: opsPerRun ? (opsPerRun / solidMs) * 1000 : null,
  })
}

function fmtMs(ms: number): string {
  return `${ms.toFixed(3)} ms`
}

function fmtOps(ops: number | null): string {
  return ops === null ? '—' : `${Math.round(ops).toLocaleString()} ops/sec`
}

function printTable(): void {
  if (MD) {
    console.log('| Case | BarefootJS (ms) | BarefootJS (ops/sec) | SolidJS (ms) | SolidJS (ops/sec) |')
    console.log('|---|---|---|---|---|')
    for (const r of rows) {
      console.log(
        `| ${r.label} | ${r.bfMs.toFixed(3)} | ${r.bfOps === null ? '—' : Math.round(r.bfOps).toLocaleString()} | ${r.solidMs.toFixed(3)} | ${r.solidOps === null ? '—' : Math.round(r.solidOps).toLocaleString()} |`,
      )
    }
    return
  }

  const labelW = Math.max(...rows.map((r) => r.label.length), 'Case'.length) + 2
  const bfW = Math.max(...rows.map((r) => (fmtMs(r.bfMs) + ' / ' + fmtOps(r.bfOps)).length), 'BarefootJS'.length) + 2
  console.log('')
  console.log('  ' + 'Case'.padEnd(labelW) + 'BarefootJS'.padEnd(bfW) + 'SolidJS')
  console.log('  ' + '-'.repeat(labelW + bfW + 30))
  for (const r of rows) {
    const bfCol = `${fmtMs(r.bfMs)} / ${fmtOps(r.bfOps)}`
    const solidCol = `${fmtMs(r.solidMs)} / ${fmtOps(r.solidOps)}`
    console.log('  ' + r.label.padEnd(labelW) + bfCol.padEnd(bfW) + solidCol)
  }
}

// ---------------------------------------------------------------------------
// Sanity check: confirm both chosen primitives fire synchronously in this
// exact harness shape (own createRoot, write happens inside the still-
// executing root callback) before trusting any timed number below.
// ---------------------------------------------------------------------------

console.log('\n=== Reactive Primitives Benchmark: BarefootJS vs SolidJS ===\n')
console.log('--- Sanity check: synchronous effect propagation ---')

{
  let bfRuns = 0
  createRoot((dispose) => {
    const [get, set] = createSignal(0)
    createEffect(() => {
      get()
      bfRuns++
    })
    set(1)
    dispose()
  })
  verifySync('sanity: single unbatched write', 'BarefootJS', 2, bfRuns)
  console.log(`  BarefootJS: effect ran ${bfRuns} time(s) for 1 create + 1 unbatched write (expect 2)`)
}

{
  let solidRuns = 0
  sCreateRoot((dispose: () => void) => {
    const [get, set] = sCreateSignal(0)
    sCreateEffect(() => {
      get()
      solidRuns++
    })
    set(1)
    dispose()
  })
  verifySync('sanity: single unbatched write', 'SolidJS', 2, solidRuns)
  console.log(`  SolidJS:    effect ran ${solidRuns} time(s) for 1 create + 1 unbatched write (expect 2)`)
}

{
  let bfRuns = 0
  createRoot((dispose) => {
    const [get, set] = createSignal(0)
    createEffect(() => {
      get()
      bfRuns++
    })
    batch(() => {
      set(1)
      set(2)
      set(3)
    })
    dispose()
  })
  verifySync('sanity: batched writes', 'BarefootJS', 2, bfRuns)
  console.log(`  BarefootJS: effect ran ${bfRuns} time(s) for 1 create + 1 batch of 3 writes (expect 2)`)
}

{
  let solidRuns = 0
  sCreateRoot((dispose: () => void) => {
    const [get, set] = sCreateSignal(0)
    sCreateEffect(() => {
      get()
      solidRuns++
    })
    sBatch(() => {
      set(1)
      set(2)
      set(3)
    })
    dispose()
  })
  verifySync('sanity: batched writes', 'SolidJS', 2, solidRuns)
  console.log(`  SolidJS:    effect ran ${solidRuns} time(s) for 1 create + 1 batch of 3 writes (expect 2)`)
}

console.log('')

// ---------------------------------------------------------------------------
// 1. Signal creation
// ---------------------------------------------------------------------------
{
  const N = 100_000
  const bfMs = measure(() => {
    createRoot((dispose) => {
      for (let i = 0; i < N; i++) createSignal(i)
      dispose()
    })
  }, 20)
  const solidMs = measure(() => {
    sCreateRoot((dispose: () => void) => {
      for (let i = 0; i < N; i++) sCreateSignal(i)
      dispose()
    })
  }, 20)
  record(`Create ${N.toLocaleString()} signals`, bfMs, solidMs, N)
}

// ---------------------------------------------------------------------------
// 2. Signal read
// ---------------------------------------------------------------------------
{
  const N = 100_000
  createRoot((dispose) => {
    const signals = Array.from({ length: N }, (_, i) => createSignal(i))
    const bfMs = measure(() => {
      let sum = 0
      for (let i = 0; i < N; i++) sum += signals[i]![0]()
    }, 20)
    dispose()

    sCreateRoot((sDispose: () => void) => {
      const sSignals = Array.from({ length: N }, (_, i) => sCreateSignal(i))
      const solidMs = measure(() => {
        let sum = 0
        for (let i = 0; i < N; i++) sum += sSignals[i]![0]()
      }, 20)
      sDispose()
      record(`Read ${N.toLocaleString()} signals`, bfMs, solidMs, N)
    })
  })
}

// ---------------------------------------------------------------------------
// 3. Signal write (no subscribers)
// ---------------------------------------------------------------------------
{
  const N = 100_000
  createRoot((dispose) => {
    const signals = Array.from({ length: N }, (_, i) => createSignal(i))
    const bfMs = measure(() => {
      for (let i = 0; i < N; i++) signals[i]![1](i + 1)
    }, 20)
    dispose()

    sCreateRoot((sDispose: () => void) => {
      const sSignals = Array.from({ length: N }, (_, i) => sCreateSignal(i))
      const solidMs = measure(() => {
        for (let i = 0; i < N; i++) sSignals[i]![1](i + 1)
      }, 20)
      sDispose()
      record(`Write ${N.toLocaleString()} signals (no sub)`, bfMs, solidMs, N)
    })
  })
}

// ---------------------------------------------------------------------------
// 4. Signal write -> 1 effect (targeted update)
// ---------------------------------------------------------------------------
{
  const N = 10_000

  createRoot((dispose) => {
    const [get, set] = createSignal(0)
    createEffect(() => {
      get()
    })
    const bfMs = measure(() => {
      for (let i = 0; i < N; i++) set(i)
    }, 20)
    dispose()

    sCreateRoot((sDispose: () => void) => {
      const [sGet, sSet] = sCreateSignal(0)
      sCreateEffect(() => {
        sGet()
      })
      const solidMs = measure(() => {
        for (let i = 0; i < N; i++) sSet(i)
      }, 20)
      sDispose()
      record(`Update signal -> 1 effect x ${N.toLocaleString()}`, bfMs, solidMs, N)
    })
  })

  // Isolated correctness check (small N, not part of the timed run above).
  // Starts the signal at -1 so every write in the 0..99 loop is a genuine
  // value change (an Object.is-equal write of 0 -> 0 correctly bails in
  // both libraries, which would otherwise look like a spurious mismatch).
  let bfRuns = 0
  createRoot((dispose) => {
    const [get, set] = createSignal(-1)
    createEffect(() => {
      get()
      bfRuns++
    })
    bfRuns = 0
    for (let i = 0; i < 100; i++) set(i)
    dispose()
  })
  verifySync('signal -> 1 effect x100', 'BarefootJS', 100, bfRuns)

  let solidRuns = 0
  sCreateRoot((dispose: () => void) => {
    const [get, set] = sCreateSignal(-1)
    sCreateEffect(() => {
      get()
      solidRuns++
    })
    solidRuns = 0
    for (let i = 0; i < 100; i++) set(i)
    dispose()
  })
  verifySync('signal -> 1 effect x100', 'SolidJS', 100, solidRuns)
}

// ---------------------------------------------------------------------------
// 5. Fan-out: 1 signal -> N effects
// ---------------------------------------------------------------------------
{
  const EFFECTS = 1000

  createRoot((dispose) => {
    const [get, set] = createSignal(0)
    for (let i = 0; i < EFFECTS; i++) {
      createEffect(() => {
        get()
      })
    }
    const bfMs = measure(() => {
      set((v: number) => v + 1)
    }, 100)
    dispose()

    sCreateRoot((sDispose: () => void) => {
      const [sGet, sSet] = sCreateSignal(0)
      for (let i = 0; i < EFFECTS; i++) {
        sCreateEffect(() => {
          sGet()
        })
      }
      const solidMs = measure(() => {
        sSet((v: number) => v + 1)
      }, 100)
      sDispose()
      record(`Fan-out: 1 signal -> ${EFFECTS.toLocaleString()} effects`, bfMs, solidMs, EFFECTS)
    })
  })

  // Isolated correctness check: one write should run exactly EFFECTS effects.
  let bfRuns = 0
  createRoot((dispose) => {
    const [get, set] = createSignal(0)
    for (let i = 0; i < EFFECTS; i++) {
      createEffect(() => {
        get()
        bfRuns++
      })
    }
    bfRuns = 0
    set((v: number) => v + 1)
    dispose()
  })
  verifySync(`fan-out x${EFFECTS}`, 'BarefootJS', EFFECTS, bfRuns)

  let solidRuns = 0
  sCreateRoot((dispose: () => void) => {
    const [get, set] = sCreateSignal(0)
    for (let i = 0; i < EFFECTS; i++) {
      sCreateEffect(() => {
        get()
        solidRuns++
      })
    }
    solidRuns = 0
    set((v: number) => v + 1)
    dispose()
  })
  verifySync(`fan-out x${EFFECTS}`, 'SolidJS', EFFECTS, solidRuns)
}

// ---------------------------------------------------------------------------
// 6. Deep chain: s0 -> memo1 -> memo2 -> ... -> memoN -> effect (unbatched)
// ---------------------------------------------------------------------------
{
  const DEPTH = 100
  const UPDATES = 1000

  createRoot((dispose) => {
    const [get, set] = createSignal(0)
    let current: () => number = get
    for (let i = 0; i < DEPTH; i++) {
      const prev = current
      current = createMemo(() => prev() + 1)
    }
    const last = current
    createEffect(() => {
      last()
    })
    const bfMs = measure(() => {
      for (let i = 0; i < UPDATES; i++) set(i)
    }, 20)
    dispose()

    sCreateRoot((sDispose: () => void) => {
      const [sGet, sSet] = sCreateSignal(0)
      let sCurrent: () => number = sGet
      for (let i = 0; i < DEPTH; i++) {
        const prev = sCurrent
        sCurrent = sCreateMemo(() => prev() + 1)
      }
      const sLast = sCurrent
      sCreateEffect(() => {
        sLast()
      })
      const solidMs = measure(() => {
        for (let i = 0; i < UPDATES; i++) sSet(i)
      }, 20)
      sDispose()
      record(`Deep chain (${DEPTH} memos) x ${UPDATES.toLocaleString()} updates`, bfMs, solidMs, UPDATES)
    })
  })

  // Isolated correctness check: each unbatched write should propagate once.
  // Starts the source signal at -1 for the same reason as case 4's check
  // above (avoids a 0 -> 0 first write that both libraries correctly bail).
  let bfRuns = 0
  createRoot((dispose) => {
    const [get, set] = createSignal(-1)
    let current: () => number = get
    for (let i = 0; i < DEPTH; i++) {
      const prev = current
      current = createMemo(() => prev() + 1)
    }
    const last = current
    createEffect(() => {
      last()
      bfRuns++
    })
    bfRuns = 0
    for (let i = 0; i < 50; i++) set(i)
    dispose()
  })
  verifySync(`deep chain (${DEPTH}) unbatched x50`, 'BarefootJS', 50, bfRuns)

  let solidRuns = 0
  sCreateRoot((dispose: () => void) => {
    const [get, set] = sCreateSignal(-1)
    let current: () => number = get
    for (let i = 0; i < DEPTH; i++) {
      const prev = current
      current = sCreateMemo(() => prev() + 1)
    }
    const last = current
    sCreateEffect(() => {
      last()
      solidRuns++
    })
    solidRuns = 0
    for (let i = 0; i < 50; i++) set(i)
    dispose()
  })
  verifySync(`deep chain (${DEPTH}) unbatched x50`, 'SolidJS', 50, solidRuns)
}

// ---------------------------------------------------------------------------
// 6b. Deep chain, batched: same shape, all writes wrapped in one batch()
// ---------------------------------------------------------------------------
{
  const DEPTH = 100
  const UPDATES = 1000

  createRoot((dispose) => {
    const [get, set] = createSignal(0)
    let current: () => number = get
    for (let i = 0; i < DEPTH; i++) {
      const prev = current
      current = createMemo(() => prev() + 1)
    }
    const last = current
    createEffect(() => {
      last()
    })
    const bfMs = measure(() => {
      batch(() => {
        for (let i = 0; i < UPDATES; i++) set(i)
      })
    }, 20)
    dispose()

    sCreateRoot((sDispose: () => void) => {
      const [sGet, sSet] = sCreateSignal(0)
      let sCurrent: () => number = sGet
      for (let i = 0; i < DEPTH; i++) {
        const prev = sCurrent
        sCurrent = sCreateMemo(() => prev() + 1)
      }
      const sLast = sCurrent
      sCreateEffect(() => {
        sLast()
      })
      const solidMs = measure(() => {
        sBatch(() => {
          for (let i = 0; i < UPDATES; i++) sSet(i)
        })
      }, 20)
      sDispose()
      record(`Deep chain batched (${DEPTH} memos) x ${UPDATES.toLocaleString()}`, bfMs, solidMs, UPDATES)
    })
  })

  // Isolated correctness check: one batch of many writes should propagate once.
  let bfRuns = 0
  createRoot((dispose) => {
    const [get, set] = createSignal(0)
    let current: () => number = get
    for (let i = 0; i < DEPTH; i++) {
      const prev = current
      current = createMemo(() => prev() + 1)
    }
    const last = current
    createEffect(() => {
      last()
      bfRuns++
    })
    bfRuns = 0
    batch(() => {
      for (let i = 0; i < 50; i++) set(i)
    })
    dispose()
  })
  verifySync(`deep chain (${DEPTH}) batched x50-in-1-batch`, 'BarefootJS', 1, bfRuns)

  let solidRuns = 0
  sCreateRoot((dispose: () => void) => {
    const [get, set] = sCreateSignal(0)
    let current: () => number = get
    for (let i = 0; i < DEPTH; i++) {
      const prev = current
      current = sCreateMemo(() => prev() + 1)
    }
    const last = current
    sCreateEffect(() => {
      last()
      solidRuns++
    })
    solidRuns = 0
    sBatch(() => {
      for (let i = 0; i < 50; i++) set(i)
    })
    dispose()
  })
  verifySync(`deep chain (${DEPTH}) batched x50-in-1-batch`, 'SolidJS', 1, solidRuns)
}

// ---------------------------------------------------------------------------
// 7. Wide + deep: N independent signal -> memo -> effect chains
// ---------------------------------------------------------------------------
{
  const CHAINS = 1000

  createRoot((dispose) => {
    const signals: Array<[() => number, (v: number | ((prev: number) => number)) => void]> = []
    for (let i = 0; i < CHAINS; i++) {
      const [get, set] = createSignal(0)
      const doubled = createMemo(() => get() * 2)
      createEffect(() => {
        doubled()
      })
      signals.push([get, set])
    }
    const bfMs = measure(() => {
      for (let i = 0; i < CHAINS; i++) signals[i]![1](i)
    }, 20)
    dispose()

    sCreateRoot((sDispose: () => void) => {
      const sSignals: Array<[() => number, (v: number | ((prev: number) => number)) => void]> = []
      for (let i = 0; i < CHAINS; i++) {
        const [get, set] = sCreateSignal(0)
        const doubled = sCreateMemo(() => get() * 2)
        sCreateEffect(() => {
          doubled()
        })
        sSignals.push([get, set])
      }
      const solidMs = measure(() => {
        for (let i = 0; i < CHAINS; i++) sSignals[i]![1](i)
      }, 20)
      sDispose()
      record(`${CHAINS.toLocaleString()} independent signal->memo->effect`, bfMs, solidMs, CHAINS)
    })
  })

  // Isolated correctness check: one write per chain should run each chain's
  // effect exactly once (no cross-chain triggering).
  let bfRuns = 0
  createRoot((dispose) => {
    const signals: Array<[() => number, (v: number | ((prev: number) => number)) => void]> = []
    for (let i = 0; i < CHAINS; i++) {
      const [get, set] = createSignal(0)
      const doubled = createMemo(() => get() * 2)
      createEffect(() => {
        doubled()
        bfRuns++
      })
      signals.push([get, set])
    }
    bfRuns = 0
    for (let i = 0; i < CHAINS; i++) signals[i]![1](i + 1)
    dispose()
  })
  verifySync(`${CHAINS} independent chains, 1 write each`, 'BarefootJS', CHAINS, bfRuns)

  let solidRuns = 0
  sCreateRoot((dispose: () => void) => {
    const sSignals: Array<[() => number, (v: number | ((prev: number) => number)) => void]> = []
    for (let i = 0; i < CHAINS; i++) {
      const [get, set] = sCreateSignal(0)
      const doubled = sCreateMemo(() => get() * 2)
      sCreateEffect(() => {
        doubled()
        solidRuns++
      })
      sSignals.push([get, set])
    }
    solidRuns = 0
    for (let i = 0; i < CHAINS; i++) sSignals[i]![1](i + 1)
    dispose()
  })
  verifySync(`${CHAINS} independent chains, 1 write each`, 'SolidJS', CHAINS, solidRuns)
}

// ---------------------------------------------------------------------------
// 8. Partial update: 1000 signals + 1000 effects, write every 10th
//    (prints an effect-run-count for both libraries — this verifies
//    fine-grainedness by observation, it does not assert one architecture
//    is more correct than another: a coarser framework that re-ran every
//    effect on any write would still be "correct", just not fine-grained.)
// ---------------------------------------------------------------------------
{
  const ROWS = 1000
  const EVERY = 10
  const EXPECTED_PER_PASS = ROWS / EVERY

  let bfEffectRunCount = 0
  let bfIterations = 0
  createRoot((dispose) => {
    const signals: Array<[() => number, (v: number | ((prev: number) => number)) => void]> = []
    for (let i = 0; i < ROWS; i++) {
      const [get, set] = createSignal(i)
      createEffect(() => {
        get()
        bfEffectRunCount++
      })
      signals.push([get, set])
    }
    bfEffectRunCount = 0
    bfIterations = 0
    const bfMs = measure(() => {
      for (let i = 0; i < ROWS; i += EVERY) signals[i]![1]((v: number) => v + 1)
      bfIterations++
    }, 100)
    dispose()

    sCreateRoot((sDispose: () => void) => {
      const sSignals: Array<[() => number, (v: number | ((prev: number) => number)) => void]> = []
      let solidEffectRunCount = 0
      let solidIterations = 0
      for (let i = 0; i < ROWS; i++) {
        const [get, set] = sCreateSignal(i)
        sCreateEffect(() => {
          get()
          solidEffectRunCount++
        })
        sSignals.push([get, set])
      }
      solidEffectRunCount = 0
      solidIterations = 0
      const solidMs = measure(() => {
        for (let i = 0; i < ROWS; i += EVERY) sSignals[i]![1]((v: number) => v + 1)
        solidIterations++
      }, 100)
      sDispose()

      record(`Partial update: ${EXPECTED_PER_PASS} of ${ROWS} rows`, bfMs, solidMs, EXPECTED_PER_PASS)

      console.log('')
      console.log(`  Effect-run count (write every ${EVERY}th of ${ROWS}, expected ${EXPECTED_PER_PASS} per pass):`)
      console.log(`    BarefootJS: ${(bfEffectRunCount / bfIterations).toFixed(1)} effect runs/pass`)
      console.log(`    SolidJS:    ${(solidEffectRunCount / solidIterations).toFixed(1)} effect runs/pass`)
    })
  })
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

console.log('')
printTable()
console.log('')
