/**
 * Write-dispatch snapshot semantics (reactive perf: dependency-sweep +
 * cached subscriber-array optimization in `reactive.ts`).
 *
 * `set()` dispatches subscribers from a snapshot captured at the start of
 * the write, not a live view of the signal's subscriber Set — this pins
 * that contract (unchanged by the perf work: only *how* the snapshot is
 * produced/cached changed, never its observable effect) for the two ways a
 * dispatch's live subscriber Set can be mutated while it's running:
 *
 *   1. A subscriber ADDED during the dispatch (by an effect that runs
 *      earlier in this same write) does not get an extra run out of THIS
 *      write — it only runs once, from its own creation.
 *   2. A subscriber REMOVED (disposed) during the dispatch, by an effect
 *      that runs earlier in this same write and was already captured in the
 *      snapshot, is skipped for the remainder of THIS write (`runEffect`'s
 *      `disposed` guard short-circuits it) and never runs again.
 *
 * Also pins dynamic dependency tracking: an effect that stops reading a
 * signal (conditional branch swap) stops re-running when that signal
 * changes, and starts re-running for the signal it switched to.
 */

import { describe, test, expect } from 'bun:test'
import { createSignal, createEffect, createRoot } from '../src/reactive'

describe('write-dispatch snapshot', () => {
  test('a subscriber added mid-dispatch by an earlier effect does not run again in that same write', () => {
    const [s, setS] = createSignal(0)
    const log: string[] = []
    let writeCount = 0

    createRoot(() => {
      createEffect(() => {
        s()
        log.push('existing')
        if (writeCount === 1) {
          // Created WHILE this write's dispatch is still running (as part of
          // `existing`'s re-run). It runs once immediately (creation always
          // runs its effect body), but must not be picked up a second time
          // by the dispatch loop that's already in progress for this write —
          // that loop's subscriber list was snapshotted before `existing`
          // (and therefore before this nested creation) ran.
          createEffect(() => {
            s()
            log.push('late')
          })
        }
      })
    })

    expect(log).toEqual(['existing']) // mount

    log.length = 0
    writeCount = 1
    setS(1)
    // `late` appears exactly once — from its own creation — not twice.
    expect(log).toEqual(['existing', 'late'])

    log.length = 0
    writeCount = 2
    setS(2)
    // Now both are genuinely subscribed and both run.
    expect(log).toEqual(['existing', 'late'])
  })

  test('a subscriber disposed mid-dispatch by an earlier effect is skipped for the rest of that write, and never runs again', () => {
    const [s, setS] = createSignal(0)
    const log: string[] = []
    let disposeVictim: (() => void) | undefined
    let shouldDispose = false

    createRoot(() => {
      // Created first, so it's earlier in the subscriber Set's insertion
      // (= dispatch) order than `victim` below.
      createEffect(() => {
        s()
        log.push('trigger')
        if (shouldDispose && disposeVictim) {
          disposeVictim()
        }
      })
      createRoot((d) => {
        disposeVictim = d
        createEffect(() => {
          s()
          log.push('victim')
        })
      })
    })

    expect(log).toEqual(['trigger', 'victim']) // mount: both subscribed

    log.length = 0
    shouldDispose = true
    setS(1)
    // `trigger` runs first (dispatch order), disposes `victim` mid-write.
    // `victim` was already captured in this write's snapshot, but
    // `runEffect`'s disposed-guard makes it a no-op for the rest of this
    // write — it must NOT run.
    expect(log).toEqual(['trigger'])

    log.length = 0
    setS(2)
    // And it stays unsubscribed on every subsequent write.
    expect(log).toEqual(['trigger'])
  })

  test('dynamic dependency swap: an effect that switches from reading A to reading B stops re-running on A and starts re-running on B', () => {
    const [useA, setUseA] = createSignal(true)
    const [a, setA] = createSignal('A0')
    const [b, setB] = createSignal('B0')
    let runs = 0
    const log: string[] = []

    createEffect(() => {
      runs++
      log.push(useA() ? a() : b())
    })

    expect(runs).toBe(1)
    expect(log).toEqual(['A0'])

    setA('A1')
    expect(runs).toBe(2)
    expect(log).toEqual(['A0', 'A1'])

    setUseA(false) // switches the read from `a` to `b`
    expect(runs).toBe(3)
    expect(log).toEqual(['A0', 'A1', 'B0'])

    setA('A2') // `a` is no longer read — must NOT trigger a re-run
    expect(runs).toBe(3)
    expect(log).toEqual(['A0', 'A1', 'B0'])

    setB('B1') // `b` IS now read — must trigger a re-run
    expect(runs).toBe(4)
    expect(log).toEqual(['A0', 'A1', 'B0', 'B1'])
  })

  test('a signal read twice in one effect body still triggers only one re-run per change (dependency Set/Map dedupes)', () => {
    const [count, setCount] = createSignal(0)
    let runs = 0
    createEffect(() => {
      // Read the same signal twice in one body.
      count()
      count()
      runs++
    })
    expect(runs).toBe(1)
    setCount(1)
    expect(runs).toBe(2)
  })

  test('reentrant (circular) effect still throws, and — matching pre-existing behavior — a later write to the SAME signal re-throws too', () => {
    // Regression guard for the end-of-run dependency sweep (only the
    // OUTERMOST invocation of a reentrant chain sweeps stale dependencies,
    // using the run's final `gen` — see `runEffect`). This pins TODAY's
    // actual behavior, not an idealized one: the aborted effect's last
    // completed (deepest) nested run legitimately re-read `count` right
    // before erroring further down, so the sweep — correctly — does not
    // treat `count` as stale and leaves the effect subscribed to it. That
    // matches the pre-optimization code exactly (verified against it
    // directly): a later write to `count` re-invokes the same broken effect
    // and re-throws. This is a pre-existing quirk of the circular-dependency
    // guard, not something this perf work changed — an UNRELATED signal
    // remains completely unaffected.
    const [count, setCount] = createSignal(0)
    const [other, setOther] = createSignal(0)

    expect(() => {
      createEffect(() => {
        setCount(count() + 1)
      })
    }).toThrow('Circular dependency detected')

    // Same signal: still wired to the aborted effect, still throws.
    expect(() => setCount(999)).toThrow('Circular dependency detected')

    // A completely unrelated signal is unaffected by the aborted effect.
    let seen = -1
    createEffect(() => {
      seen = other()
    })
    expect(seen).toBe(0)
    setOther(42)
    expect(seen).toBe(42)
  })
})
