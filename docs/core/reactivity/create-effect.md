---
title: createEffect
description: Runs a function and re-runs it whenever its tracked signal dependencies change.
---

# createEffect

Runs a function immediately and re-runs it whenever any signal read inside it changes. Dependencies are tracked from the reads themselves; there is no dependency array.

```ts
import { createEffect } from '@barefootjs/client'

createEffect(fn: () => void | (() => void)): void
```

```tsx
const [count, setCount] = createSignal(0)

createEffect(() => {
  document.title = `Count: ${count()}`
})

setCount(1) // re-runs; the title becomes "Count: 1"
```

## Cleanup

Register teardown with [`onCleanup`](./on-cleanup.md). It runs before the effect re-runs and when the component is destroyed. Returning a function from the effect does the same.

```tsx
createEffect(() => {
  const timer = setInterval(() => console.log('tick'), 1000)
  onCleanup(() => clearInterval(timer))
})
```

The same shape cancels a stale request when its input changes:

```tsx
const [query, setQuery] = createSignal('')

createEffect(() => {
  const q = query()
  if (!q) return

  const controller = new AbortController()
  fetch(`/api/search?q=${q}`, { signal: controller.signal })
    .then(r => r.json())
    .then(setResults)

  onCleanup(() => controller.abort())
})
```

## Effects run during hydration

The first run happens synchronously while the component hydrates, against the server-rendered HTML. The server bakes only a signal's declared initial value, so an effect whose first run writes a signal — `createEffect(() => setSeen(props.value))` over `createSignal(0)` — swaps `0` for the prop's value the moment the component hydrates. Seed the signal instead (`createSignal(props.value)`), or derive the value with [`createMemo`](./create-memo.md). Reserve effects for side effects: browser APIs, subscriptions, logging.
