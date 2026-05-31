---
title: batch
description: Groups multiple signal writes so dependent effects and memos run once, after all writes complete.
---

# batch

Groups multiple signal writes so that dependent effects and memos run **once**,
after all the writes inside the batch complete — instead of once per write.

```tsx
import { batch } from '@barefootjs/client'

batch<T>(fn: () => T): T
```

Returns the value produced by `fn`.

## Default behavior (no batch)

BarefootJS propagates updates **synchronously**: each setter call immediately
re-runs every subscriber. This keeps reads-after-writes predictable — after a
setter returns, derived memos, effects, and the DOM already reflect the new value.

The cost is that writing N signals that share a subscriber re-runs that
subscriber N times, and the subscriber briefly observes intermediate states
where some signals are updated and others are not:

```tsx
const [x, setX] = createSignal(40)
const [y, setY] = createSignal(60)

createEffect(() => {
  // depends on both x and y
  send({ x: x(), y: y() })
})

setX(70) // effect runs — observes x=70, y=60 (intermediate)
setY(30) // effect runs again — observes x=70, y=30
```

Beyond its initial run on creation, the effect ran twice more — once per write —
and saw a transient `x=70, y=60` state.

## With batch

```tsx
batch(() => {
  setX(70)
  setY(30)
})
// effect runs once, observing x=70, y=30
```

Inside `batch`, writes are collected and dependent subscribers are de-duplicated,
so each runs **exactly once** after the batch ends — and never observes an
intermediate, half-updated state.

## When to use

When a single handler updates several signals that feed shared effects/memos,
`batch` collapses the work into one update pass — and keeps the subscriber from
running while a cross-field invariant is temporarily broken:

```tsx
const reset = () => {
  batch(() => {
    setName('')
    setEmail('')
    setAge(0)
    // ...20 more fields
  })
  // every subscriber ran once, not once-per-field
}
```

## Caveats

### Derived values are stale *inside* the batch

`batch` defers the work that recomputes derived values. Plain signal reads return
the new value immediately, but **memos and effect-driven values stay stale until
the batch ends**:

```tsx
const [n, setN] = createSignal(1)
const doubled = createMemo(() => n() * 2)

batch(() => {
  setN(10)
  n()       // 10  — plain signal read is fresh
  doubled() // 2   — STALE; the memo hasn't recomputed yet
})
doubled()   // 20  — recomputed after the batch ends
```

If you need the recomputed value, read it after the batch.

### `await` escapes the batch

`batch` only covers the **synchronous** portion of `fn`. Wrapping an async
function in `batch` groups only the writes before the first `await` — everything
after runs ungrouped, and the promise `batch` returns is easy to leave floating.

Instead, wrap each synchronous group of writes in its own `batch`, with `await`
between the groups:

```tsx
const onSubmit = async () => {
  batch(() => {
    setLoading(true)
    setError(null)
  })

  try {
    const result = await save()
    batch(() => {
      setLoading(false)
      setResult(result)
    })
  } catch (err) {
    batch(() => {
      setLoading(false)
      setError(err)
    })
  }
}
```

## Note

`batch` is an **opt-in** optimization. Forgetting it is never a correctness bug —
code still works, just with extra subscriber runs. Reach for `batch` when a
handler writes many signals that share subscribers, or when an effect must not
observe a partially-updated state.
