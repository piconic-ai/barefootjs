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

The compiler generates effects for reactive attributes:

```tsx
// Source
<button disabled={!accepted()}>Submit</button>

// Generated client JS
createEffect(() => {
  button.disabled = !accepted()
})
```
