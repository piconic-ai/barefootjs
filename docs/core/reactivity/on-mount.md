---
title: onMount
description: Runs a callback once when the component initializes, without tracking signal dependencies.
---

# onMount

Runs once when the component initializes. Signal accesses inside are **not** tracked.

```tsx
import { onMount } from '@barefootjs/client'

onMount(fn: () => void): void
```


## Basic Usage

```tsx
onMount(() => {
  console.log('Component initialized')
})
```

Unlike `createEffect`, this function never re-runs. It executes once at initialization time.


## Common Patterns

### Browser state

```tsx
onMount(() => {
  const hash = window.location.hash
  setFilter(hash === '#/active' ? 'active' : 'all')
})
```

### Event listeners

```tsx
onMount(() => {
  const handleHashChange = () => setFilter(getFilterFromHash())
  window.addEventListener('hashchange', handleHashChange)
  onCleanup(() => window.removeEventListener('hashchange', handleHashChange))
})
```

### Focus

```tsx
onMount(() => {
  inputElement.focus()
})
```


## How It Works

`onMount` is equivalent to `createEffect(() => untrack(fn))`. The function runs inside an effect context (so `onCleanup` works), but `untrack` prevents dependency tracking.

Because it is an effect, it runs synchronously during hydration, before any user interaction. A signal written from `onMount` therefore changes the server-rendered DOM as soon as the component hydrates — the server can only bake a signal's declared initial value. That is the intended use (the "Browser state" pattern above reads `window.location`, which the server does not have), but if the value is knowable up front, seed the signal with it instead. See [Effects Run During Hydration](./create-effect.md#effects-run-during-hydration).


## `onMount` vs `createEffect`

| | `onMount` | `createEffect` |
|---|---|---|
| Runs on init | Yes | Yes |
| Re-runs on signal change | No | Yes |
| Tracks dependencies | No | Yes |
| Supports `onCleanup` | Yes | Yes |
