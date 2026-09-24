'use client'

// Test fixture: a diamond dependency — one signal read through two memos
// by a single effect. A runtime that dispatches each write to subscribers
// in subscription order re-runs the effect as soon as memo `b` recomputes,
// BEFORE memo `c` has — that run observes `b` at the new value and `c` at
// the previous one, and the effect then runs again for `c` and once more
// for its own subscription to `a`. The reactive runtime
// (`packages/client/src/reactive.ts`) marks every affected node first and
// then brings each one up to date, pulling the memos it reads, so the
// effect runs once per write with both memos recomputed.
//
// The DOM is never painted mid-handler, so a half-updated state would be
// invisible on screen — only an effect with a side effect (a fetch, a
// counter, a request-descriptor evaluation) observes it. That is what the
// `runs` / `glitches` counters below make visible in the DOM.
//
// Contract: one write → one effect run, and every run observes a consistent
// snapshot (`b() === a() * 10 && c() === a() * 100`); the fixture's
// `interactions` assert it (`runs` 1, `glitches` 0 after one click).

import { createSignal, createMemo, createEffect } from '@barefootjs/client'

export function DiamondPropagation() {
  const [a, setA] = createSignal(1)
  const b = createMemo(() => a() * 10)
  const c = createMemo(() => a() * 100)
  const [runs, setRuns] = createSignal(0)
  const [glitches, setGlitches] = createSignal(0)
  // Skip the effect's own first synchronous run's WRITE, as
  // `BodyDestructuredPropsLive.tsx` does — SSR bakes `runs` / `glitches`'
  // declared initial values into the markup, and a first-run write would
  // move the DOM off the bytes hydration just attached to.
  let mounted = false
  createEffect(() => {
    const base = a()
    const consistent = b() === base * 10 && c() === base * 100
    if (!mounted) {
      mounted = true
      return
    }
    setRuns(n => n + 1)
    if (!consistent) setGlitches(n => n + 1)
  })

  return (
    <div className="diamond-propagation">
      <span className="a">{a()}</span>
      <span className="b">{b()}</span>
      <span className="c">{c()}</span>
      <span className="runs">{runs()}</span>
      <span className="glitches">{glitches()}</span>
      <button className="btn-inc" onClick={() => setA(n => n + 1)}>
        +1
      </button>
    </div>
  )
}
