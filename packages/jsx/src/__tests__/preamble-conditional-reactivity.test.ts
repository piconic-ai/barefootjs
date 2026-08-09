/**
 * #2596 — inside a `.map()` callback, a conditional whose condition is a
 * bare reference to a preamble-declared local (a pre-return `const` in the
 * callback body) never got its IR `reactive` flag set, even when the
 * preamble local reads a signal:
 *
 *   {items().map((item) => {
 *     const label = item.title || fallback()   // preamble local reading a signal
 *     return <li>{label ? <Badge/> : <Placeholder/>}</li>   // never re-evaluated
 *   })}
 *
 * Root cause: Phase 1's conditional-reactivity classifiers
 * (`isReactiveExpression` for the condition's own text, `referencesLoopParam`
 * for item/index/destructure names via `BindingScope.valueBoundNames()`) only
 * ever see the token `label` — never its declaration — so a bare preamble-
 * local reference tripped neither.
 *
 * Fix (`jsx-to-ir.ts`):
 *  - `computePreambleReactiveNames` determines which preamble-declared names
 *    are THEMSELVES reactive — read a signal/memo/reactive prop, directly or
 *    transitively through an earlier preamble declaration — by re-running
 *    the SAME `isReactiveExpression` classifier already used for ordinary
 *    conditions, against each declaration's initializer.
 *  - `markPreambleConditionalReactivity` is a new post-hoc pass (same shape
 *    as `collectPreambleRegions`/`markPreambleAttrSlots`, #2447) that grants
 *    `reactive: true` + a slot id to a loop-body conditional whose condition
 *    bare-references one of those names.
 *
 * This alone isn't sufficient — Phase 2's `collectLoopChildConditionals`
 * independently re-derives reactivity from the condition's EXPANDED text via
 * `classifyReactivity`, and `expandConstantForReactivity`'s shadow guard
 * (#2482 Stage 1b) deliberately leaves a preamble-bound identifier like
 * `label` unexpanded, so `classifyReactivity('label', …)` always reads
 * 'none'. `collectLoopChildConditionals` and `emitOuterConditional` (in
 * `ir-to-client-js/`) got the same `readsPreamble` bypass +
 * preamble-re-run-in-getter treatment `collectLoopChildReactiveAttrs`
 * already had (#2447) — the condition-position twin.
 *
 * These tests assert the COMPILED OUTPUT shape (mirrors
 * `csr-materialize-loop-preamble-shadow.test.ts` and
 * `preamble-region-patch.test.ts`'s convention: compiler-internals
 * correctness is a generated-code-shape pin, not a live-DOM test — DOM
 * execution of `insert()`/`mapArrayLazy`'s own reactive-tracking contract is
 * covered by their own runtime unit tests).
 *
 * Depending on loop-row shape, the fix surfaces through one of two Phase 2
 * plans — both draw from the SAME `collectLoopChildConditionals` fix:
 *  - Both branches "wiring-free static elements" (`analyzeLazyConditional`,
 *    §9.4 L3): the lazy-row plan (`mapArrayLazy`), which recomputes the
 *    preamble in `applyItem` (per-row) AND `applyOuter` (outer-signal
 *    effect, primed by reading the signal unconditionally).
 *  - Otherwise: the eager `mapArray` + `insert()` plan, which recomputes the
 *    preamble inside the getter passed to `insert()`.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJsFor(source: string): string {
  const result = compileJSX(source, 'Repro.tsx', { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')
  expect(clientJs).toBeDefined()
  return clientJs!.content
}

describe('preamble-conditional-reactivity (#2596)', () => {
  test('(a) a conditional condition reading a signal-derived preamble local is reactive (lazy-row plan)', () => {
    const js = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Widget({ items }: { items: { id: number; title: string }[] }) {
        const [fallback, setFallback] = createSignal('x')
        return (
          <ul>
            {items.map((item) => {
              const label = item.title || fallback()
              return <li key={item.id}>{label ? <span>yes</span> : <span>no</span>}</li>
            })}
          </ul>
        )
      }
    `)
    // Both arms are wiring-free static elements — eligible for the lazy-row
    // plan (§9.4 L3), which carries no per-row insert()/createEffect.
    expect(js).toContain('mapArrayLazy(')
    // The preamble re-runs (loop-param accessor form, `item()`) inside BOTH
    // apply bodies — `applyItem` (per-row, same-key update) and `applyOuter`
    // (the outer-signal effect) — never the plain (`item.title`) form.
    const preambleRerun = /const label = item\(\)\.title \|\| fallback\(\);/g
    expect(js.match(preambleRerun)?.length).toBeGreaterThanOrEqual(2)
    // `applyOuter` primes the signal read unconditionally (§9.3(3)) so the
    // effect subscribes even when the row list is momentarily empty — this
    // IS the fix: before it, nothing in the emitted plan read `fallback()`
    // outside the one-time row-construction line, so the effect never
    // subscribed and the branch froze at its SSR-time value.
    expect(js).toMatch(/applyOuter:\s*\(__es, __seed\) => \{\s*fallback\(\)/)
    // The conditional actually got wired — not the empty no-op body a
    // non-reactive conditional gets (see negative-case test below).
    expect(js).not.toContain('applyItem: () => {}')
  })

  test('(b) the same shape through the eager insert() plan when a branch carries its own reactive text', () => {
    const js = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Widget({ items }: { items: { id: number; title: string }[] }) {
        const [fallback, setFallback] = createSignal('x')
        return (
          <ul>
            {items.map((item) => {
              const label = item.title || fallback()
              return <li key={item.id}>{label ? <span>{item.title} yes</span> : <span>no</span>}</li>
            })}
          </ul>
        )
      }
    `)
    // A branch with its own reactive text disqualifies the lazy-row plan
    // (`analyzeLazyConditional` requires wiring-free arms) — this exercises
    // the OTHER Phase 2 path the fix threads through.
    expect(js).toContain('mapArray(')
    expect(js).not.toContain('mapArrayLazy(')
    // `insert()`'s condition getter re-runs the preamble before reading
    // `label` — the local isn't otherwise in scope inside that closure.
    expect(js).toMatch(
      /insert\(__el, 's1', \(\) => \{ const label = item\(\)\.title \|\| fallback\(\);; return \(label\) \}/,
    )
  })

  test('(c) a conditional reading a NON-reactive preamble local stays non-reactive', () => {
    const js = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Widget({ items }: { items: { id: number; title: string }[] }) {
        const [count, setCount] = createSignal(0)
        return (
          <ul>
            {items.map((item) => {
              const label = item.title
              return <li key={item.id}>{label ? <span>yes</span> : <span>no</span>}</li>
            })}
          </ul>
        )
      }
    `)
    // Still lazy-eligible (both arms are wiring-free statics), but the
    // conditional itself never got a slot id / reactive flag — no per-row
    // OR per-outer wiring for it at all.
    expect(js).toContain('mapArrayLazy(')
    expect(js).toContain('applyItem: () => {}')
    expect(js).not.toContain('applyOuter')
    expect(js).not.toContain('insert(')
    // The condition's static, row-construction-time value is still baked
    // into the row template (correct — it's genuinely never going to
    // change without a fresh row).
    expect(js).toMatch(/label \? `<span>yes<\/span>` : `<span>no<\/span>`/)
  })

  test('(d) transitive: a preamble local reading another preamble local that reads a signal', () => {
    const js = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Widget({ items }: { items: { id: number; title: string }[] }) {
        const [fallback, setFallback] = createSignal('x')
        return (
          <ul>
            {items.map((item) => {
              const base = fallback()
              const label = item.title || base
              return <li key={item.id}>{label ? <span>yes</span> : <span>no</span>}</li>
            })}
          </ul>
        )
      }
    `)
    // `computePreambleReactiveNames` walks preamble declarations in source
    // order, folding each name into the reactive set when its initializer
    // reads a signal/memo/prop directly OR references an earlier name
    // already in that set — `label` qualifies via `base`, not via any
    // signal call of its own.
    expect(js).toContain('mapArrayLazy(')
    expect(js).not.toContain('applyItem: () => {}')
    expect(js).toMatch(/applyOuter:\s*\(__es, __seed\) => \{\s*fallback\(\)/)
    const preambleRerun = /const base = fallback\(\); const label = item\(\)\.title \|\| base;/g
    expect(js.match(preambleRerun)?.length).toBeGreaterThanOrEqual(2)
  })
})
