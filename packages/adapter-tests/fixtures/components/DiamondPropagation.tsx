'use client'

// Test fixture: a diamond dependency — one signal read through two memos
// by a single effect. The reactive runtime (`packages/client/src/reactive.ts`)
// dispatches each write synchronously, in subscription order, with no
// topological stage: when `a` changes, memo `b` recomputes and its private
// signal re-runs the effect BEFORE memo `c` has recomputed, so that run
// observes `b` already at the new value while `c` still holds the previous
// one. The effect then runs again for `c`, and once more for its own direct
// subscription to `a` — three runs per write. `batch` does not change this:
// the flush happens at depth 0, so the memos' own writes propagate
// synchronously again.
//
// The DOM is never painted mid-handler, so the half-updated state is
// invisible on screen — only an effect with a side effect (a fetch, a
// counter, a request-descriptor evaluation) observes it. That is what the
// `runs` / `glitches` counters below make visible in the DOM.
//
// Contract: one write → one effect run, and every run observes a consistent
// snapshot (`b() === a() * 10 && c() === a() * 100`). The fixture's
// `interactions` assert that contract and fail today (`runs` reads 3 and
// `glitches` reads 1 after one click); quarantined in
// `packages/adapter-tests/e2e/fixture-hydrate-quarantine.ts` under the
// `diamond-propagation-glitch` registry limitation
// (`packages/adapter-tests/limitations/diamond-propagation-glitch.ts`).

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
