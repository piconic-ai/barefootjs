'use client'

// Fixture for Move B (#2760's follow-up): a destructured-props child
// component that stays fully reactive. Every downstream read of a
// destructured prop — plain text, a `createMemo` computation, a
// `createEffect` body, an event handler, and a reactive attribute
// (`data-label`) — must track the parent's CURRENT value, not the value
// captured at mount. See spec/compiler.md's "Prop Boundary Contract"
// section and `packages/jsx/src/props-binding.ts`'s `livePropReadExpr`.

import { createSignal, createMemo, createEffect } from '@barefootjs/client'

type LiveChildProps = {
  value: number
  label?: string
  onPick: (n: number) => void
}

function LiveChild({ value, label = 'none', onPick }: LiveChildProps) {
  const doubled = createMemo(() => value * 2)
  const [seen, setSeen] = createSignal(0)
  // Skip the effect's own FIRST synchronous run's write: SSR bakes `seen`'s
  // *declared* initial value (`createSignal(0)` → `0`) into the markup —
  // it has no way to predict what an arbitrary effect body will compute —
  // so a write on the effect's first run (same run that fires at mount in
  // CSR-only creation AND again as hydration attaches) would change the
  // DOM out from under the SSR bytes it just hydrated onto, which the
  // hydration-parity oracle (`fixture-hydrate`) correctly flags as a
  // mismatch. This reproduces identically for a `props.value`-style
  // (non-destructured) equivalent of this same component — verified by a
  // throwaway control fixture during Move B's review — so it is a general
  // "an effect's first run may disagree with the static SSR value"
  // property of effect-seeded signals, not something Move B's live-prop
  // rewrite introduced. `value` is still read unconditionally on every
  // run (including the skipped one) so the effect keeps tracking it as a
  // dependency; only the `setSeen` WRITE is deferred past mount.
  let mounted = false
  createEffect(() => {
    const current = value
    if (!mounted) {
      mounted = true
      return
    }
    setSeen(current)
  })

  return (
    <div className="live-child" data-label={label}>
      <span className="raw">{value}</span>
      <span className="memo">{doubled()}</span>
      <span className="effect">{seen()}</span>
      <button className="btn-pick" onClick={() => onPick(value)}>
        pick
      </button>
    </div>
  )
}

export function DestructuredPropsLive() {
  const [count, setCount] = createSignal(1)
  const [picked, setPicked] = createSignal(0)
  const [named, setNamed] = createSignal(false)

  return (
    <div className="destructured-props-live">
      <p className="parent-count">Count: {count()}</p>
      <p className="picked">Picked: {picked()}</p>
      <button className="btn-increment" onClick={() => setCount(n => n + 1)}>
        +1
      </button>
      <button className="btn-name" onClick={() => setNamed(v => !v)}>
        name
      </button>
      <LiveChild value={count()} label={named() ? 'named' : undefined} onPick={setPicked} />
    </div>
  )
}
