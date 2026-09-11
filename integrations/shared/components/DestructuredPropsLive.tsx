'use client'

// Fixture: a destructured-props child that stays fully reactive. Every
// downstream read of a destructured prop — plain text, a `createMemo`
// computation, a `createEffect` body, an event handler, and a reactive
// attribute (`data-label`) — must track the parent's CURRENT value, not the
// value captured at mount. See spec/compiler.md's "Prop Boundary Contract".

import { createSignal, createMemo, createEffect } from '@barefootjs/client'

type LiveChildProps = {
  value: number
  label?: string
  onPick: (n: number) => void
}

function LiveChild({ value, label = 'none', onPick }: LiveChildProps) {
  const doubled = createMemo(() => value * 2)
  const [seen, setSeen] = createSignal(0)
  // Skip the effect's own first synchronous run's WRITE. SSR can only bake
  // `seen`'s declared initial value (`createSignal(0)`) into the markup, so
  // a first-run write would move the DOM off the bytes hydration just
  // attached to, and the hydration-parity oracle flags that as a mismatch.
  // Not specific to destructured props — any effect-seeded signal whose
  // first run disagrees with the declared initial value does this. `value`
  // is still read on every run, including the skipped one, so the effect
  // keeps tracking it; only the write is deferred past mount.
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
