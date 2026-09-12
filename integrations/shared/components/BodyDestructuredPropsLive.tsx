'use client'

// Fixture: a BODY-destructured-props child that stays fully reactive — the
// body-destructure twin of `DestructuredPropsLive.tsx` (#2934). Every
// downstream read of a pure body-destructured prop alias — plain text, a
// `createMemo` computation, a `createEffect` body, an event handler, and a
// reactive attribute (`data-label`) — must track the parent's CURRENT
// value, not the value captured at the destructuring statement. See
// spec/compiler.md's "Prop Boundary Contract" and docs/core/reactivity/
// props-reactivity.md's "Destructuring In The Body" section.

import { createSignal, createMemo, createEffect } from '@barefootjs/client'

type LiveChildProps = {
  value: number
  label?: string
  onPick: (n: number) => void
}

function LiveChild(props: LiveChildProps) {
  // Body destructure, including a rename (`onPick: pick`) and a default
  // (`label = 'none'`) — both pure aliases `resolveBodyPropAliases`
  // recognizes.
  const { value, label = 'none', onPick: pick } = props
  const doubled = createMemo(() => value * 2)
  const [seen, setSeen] = createSignal(0)
  // Skip the effect's own first synchronous run's WRITE — same reasoning as
  // `DestructuredPropsLive.tsx`'s `LiveChild` (SSR can only bake `seen`'s
  // declared initial value into the markup, so a first-run write would move
  // the DOM off the bytes hydration just attached to).
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
    <div className="body-live-child" data-label={label}>
      <span className="raw">{value}</span>
      <span className="memo">{doubled()}</span>
      <span className="effect">{seen()}</span>
      <button className="btn-pick" onClick={() => pick(value)}>
        pick
      </button>
    </div>
  )
}

export function BodyDestructuredPropsLive() {
  const [count, setCount] = createSignal(1)
  const [picked, setPicked] = createSignal(0)
  const [named, setNamed] = createSignal(false)

  return (
    <div className="body-destructured-props-live">
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
