---
title: createEffect
description: Runs a function and re-runs it whenever its tracked signal dependencies change.
---

# createEffect

Runs a function immediately and re-runs it whenever any signal read inside it changes.

```tsx
import { createEffect } from '@barefootjs/client'

createEffect(fn: () => void | (() => void)): void
```


## Basic Usage

```tsx
const [count, setCount] = createSignal(0)

createEffect(() => {
  document.title = `Count: ${count()}`
})

setCount(1) // Effect re-runs, title becomes "Count: 1"
```

Dependencies are tracked automatically. No dependency array is needed.


## Conditional Dependencies

Dependencies change per run. If a branch skips a signal read, that signal is not tracked for that run:

```tsx
const [showName, setShowName] = createSignal(true)
const [name, setName] = createSignal('Alice')
const [count, setCount] = createSignal(0)

createEffect(() => {
  if (showName()) {
    console.log(name())  // name is tracked
  } else {
    console.log(count()) // count is tracked instead
  }
})
```


## Cleanup

Two ways to register cleanup for resources that need teardown before re-run.

### Return a function

```tsx
createEffect(() => {
  const timer = setInterval(() => console.log('tick'), 1000)
  return () => clearInterval(timer)
})
```

### `onCleanup`

```tsx
createEffect(() => {
  const timer = setInterval(() => console.log('tick'), 1000)
  onCleanup(() => clearInterval(timer))
})
```

`onCleanup` can be called multiple times. Cleanups run in reverse order (last registered, first called). See [`onCleanup`](./on-cleanup.md) for details.


## Common Patterns

### localStorage sync

```tsx
const [theme, setTheme] = createSignal('light')

createEffect(() => {
  localStorage.setItem('theme', theme())
})
```

### Data fetching

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

When `query` changes, the previous fetch is aborted before the new one starts.

### Reactive attributes

The compiler generates effects for reactive attributes.

Source:

```tsx
<button disabled={loading()}>Submit</button>
```

Generated client JS:

```js
const [_s0] = $(__scope, 's0')
createEffect(() => {
  if (_s0) { _s0.disabled = !!(loading()) }
})
```


## Effects Run During Hydration

`createEffect` runs its function synchronously when it is created, and a component creates its effects while it hydrates. Nothing defers the first run past hydration, so it executes against the server-rendered DOM before any user interaction.

Server rendering can only bake a signal's declared initial value. It cannot predict what an effect body will compute, so an effect whose first run writes a different value into a signal changes the DOM immediately after hydration:

```tsx
'use client'
import { createSignal, createEffect } from '@barefootjs/client'

export function Seen(props: { value: number }) {
  const [seen, setSeen] = createSignal(0)
  createEffect(() => {
    setSeen(props.value)
  })
  return <span>{seen()}</span>
}
```

Rendered with `value={5}`, the server emits `0`, and the page shows `5` as soon as the component initializes on the client. This is expected behavior, not a hydration bug: the swap is the effect doing its job. Deferring the effect until after hydration would only change when the swap happens, not whether it happens.

To keep the server-rendered and hydrated output identical, do not write a signal's initial state from an effect:

- Seed the signal with the value the effect would compute: `createSignal(props.value)`.
- Derive it with [`createMemo`](./create-memo.md) when it is a function of other signals or props.
- Reserve `createEffect` for side effects — browser APIs, subscriptions, logging — where the DOM does not depend on the effect's first run.
