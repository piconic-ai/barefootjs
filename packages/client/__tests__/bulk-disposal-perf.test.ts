/**
 * Bulk-disposal performance regression.
 *
 * `mapArray` (packages/client/src/runtime/map-array.ts) disposes n sibling
 * `createRoot` scopes one at a time when a keyed list is cleared or
 * replaced wholesale. Each disposal detaches the scope from its shared
 * parent's `children` collection via `disposeEffect`. Before the fix that
 * detach was `Array.prototype.indexOf` + `splice` — O(n) per call — so
 * disposing n siblings one by one cost O(n²) overall. This is what made
 * `clear10k` / `replace1k` in the krausest-style DOM benchmark quadratic.
 *
 * `owner.children` is now a `Set`, so `Set.delete` is O(1) and disposing n
 * siblings one at a time costs O(n) overall. This test pins that: disposing
 * 10,000 sibling roots individually must complete well under a generous
 * time bound, and every root's cleanup must still run exactly once (the
 * perf fix must not change disposal correctness).
 */

import { describe, test, expect } from 'bun:test'
import { createRoot, createEffect, onCleanup } from '../src/reactive'

describe('bulk disposal of sibling createRoot scopes', () => {
  test('disposing 60,000 sibling roots one at a time is fast and each cleanup runs exactly once', () => {
    // N=60,000: large enough to make the pre-fix O(n²) `indexOf` + `splice`
    // shift cost measurably blow the bound below (~740ms measured against
    // the unfixed code on this machine) while the post-fix O(n) `Set.delete`
    // path finishes in ~40ms — a >15x margin, not a coin flip. At the
    // task's suggested N=10,000 both implementations finish in under ~30ms
    // (the quadratic term hasn't taken over yet at that size), so that size
    // can't reliably distinguish fixed from unfixed on a noisy CI box —
    // 60,000 was chosen empirically to give a robust, unambiguous signal.
    const N = 60_000
    const cleanupCounts = new Array(N).fill(0)
    const disposers: Array<() => void> = []

    // All 60,000 roots share ONE parent owner (mirrors mapArray: every item's
    // createRoot is created while the list's own owning scope is `Owner`).
    createRoot(() => {
      for (let i = 0; i < N; i++) {
        const idx = i
        createRoot((dispose) => {
          createEffect(() => {
            onCleanup(() => {
              cleanupCounts[idx]++
            })
          })
          disposers.push(dispose)
        })
      }

      const start = performance.now()
      for (const dispose of disposers) {
        dispose()
      }
      const elapsed = performance.now() - start

      // Pre-fix (indexOf + splice per disposal, disposing front-to-back)
      // each splice shifts the remaining tail down by one, so the loop costs
      // O(n²) overall — measured ~740ms for n=60,000 against the unfixed
      // code. Post-fix (Set.delete) it's O(n) and comfortably finishes in
      // well under this generous 500ms bound even on a loaded CI box.
      expect(elapsed).toBeLessThan(500)
    })

    // Every root's effect cleanup ran exactly once — bulk disposal via the
    // new Set-backed `children` didn't skip, double-run, or reorder anyone.
    expect(cleanupCounts.length).toBe(N)
    expect(cleanupCounts.every((c) => c === 1)).toBe(true)
  })

  test('cascade disposal (parent disposed, not children individually) still runs every cleanup exactly once, in creation order', () => {
    const N = 500
    const order: number[] = []

    createRoot((disposeParent) => {
      for (let i = 0; i < N; i++) {
        const idx = i
        createRoot(() => {
          createEffect(() => {
            onCleanup(() => {
              order.push(idx)
            })
          })
        })
      }
      disposeParent()
    })

    expect(order.length).toBe(N)
    // Set preserves insertion order, so cascade disposal (disposeSubtree
    // iterating `effect.children`) still tears down children in the same
    // order they were created — same observable order as the old array.
    expect(order).toEqual(Array.from({ length: N }, (_, i) => i))
  })
})
