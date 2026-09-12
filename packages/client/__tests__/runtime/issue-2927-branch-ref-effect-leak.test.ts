/**
 * Regression test for https://github.com/piconic-ai/barefootjs/issues/2927.
 *
 * `createEffect()` called from a `ref` callback inside a conditional branch
 * used to leak one effect per re-entry into that branch: `createEffect()`
 * returns `void`, so the compiler-emitted `bindEvents` for a branch whose
 * only reactive content is a `ref`-triggered `createEffect()` returns
 * `undefined` — there is nothing for `insert()`'s `branchCleanup` mechanism
 * to call, so the previous entry's effect keeps running forever even after
 * its host element is unmounted.
 *
 * This mirrors the compiled shape from the issue: `bindEvents` calls the
 * `ref` callback (which calls `createEffect()`) and returns nothing, exactly
 * as `emitArmBody` currently emits for a branch whose only content is a
 * `ref` (no reactive attrs/texts/loops/nested conditionals to enumerate).
 *
 * Fix: `insert()` now runs every `bindEvents()` call inside its own
 * `createRoot()` (`activateBranch()` in `runtime/insert.ts`) and disposes
 * that root on the next branch switch — so effects created by opaque `ref`
 * code are cleaned up structurally, without the compiler needing to know
 * they exist.
 */
import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { insert } from '../../src/runtime/insert'
import { qsa } from '../../src/runtime/query'
import { createSignal, createEffect } from '../../src/reactive'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

describe('conditional branch ref effect is disposed on re-entry (#2927)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('createEffect() from a ref callback does not leak across branch re-entries', () => {
    // SSR shape: condition starts false, so only the fragment's comment
    // markers are rendered. The `host` element (and its `ref`) is only
    // mounted on the rising edge — same shape as the existing #1071 tests.
    document.body.innerHTML = `
      <div bf-s="Repro_test" bf="s2">
        <!--bf-cond-start:s0--><!--bf-cond-end:s0-->
      </div>
    `
    const scope = document.querySelector('[bf-s]')!
    const [show, setShow] = createSignal(false)
    const [tick, setTick] = createSignal(0)
    let effectRuns = 0

    // Mirrors the compiled `bindEvents` for a branch whose only content is
    // a `ref` — no disposer is returned, matching today's `emitArmBody`
    // output (issue's "Compiled output" section).
    insert(scope, 's0', () => show(), {
      template: () => `<div bf-c="s0" id="host" bf="s1"></div>`,
      bindEvents: (__branchScope) => {
        const el = qsa(__branchScope, '[bf="s1"]')
        if (el) {
          createEffect(() => {
            tick()
            effectRuns++
          })
        }
        // No return value — the bug this test guards against.
      }
    }, {
      template: () => `<!--bf-cond-start:s0--><!--bf-cond-end:s0-->`,
      bindEvents: () => {}
    })

    // Falsy branch: host isn't mounted, no effect yet.
    expect(effectRuns).toBe(0)

    // Rising edge: host mounts, its ref's createEffect() runs once.
    setShow(true)
    expect(effectRuns).toBe(1)

    // Falling then rising edge again (one re-entry into the `true` branch).
    setShow(false)
    setShow(true)
    const afterFirstReentry = effectRuns
    expect(afterFirstReentry).toBe(2)

    // Only ONE effect (the current one) should be live. A stale effect
    // from the first mount would double this count.
    setTick(1)
    expect(effectRuns).toBe(afterFirstReentry + 1)

    // Re-enter again — still only one live effect.
    setShow(false)
    setShow(true)
    const afterSecondReentry = effectRuns

    setTick(2)
    expect(effectRuns).toBe(afterSecondReentry + 1)
  })
})
