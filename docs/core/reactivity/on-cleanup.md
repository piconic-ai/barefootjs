---
title: onCleanup
description: Registers a cleanup function that runs when the owning effect re-runs or the component is destroyed.
---

# onCleanup

Registers a cleanup function. Called when the owning effect re-runs or the component is destroyed.

```tsx
import { onCleanup } from '@barefootjs/client'

onCleanup(fn: () => void): void
```


## Basic Usage

```tsx
createEffect(() => {
  const timer = setInterval(() => console.log('tick'), 1000)
  onCleanup(() => clearInterval(timer))
})
```

On re-run, the cleanup function runs first, clearing the previous interval before creating a new one.


## Multiple Cleanups

`onCleanup` can be called multiple times. Cleanups execute in reverse order (last registered, first called):

```tsx
createEffect(() => {
  const controller = new AbortController()
  onCleanup(() => controller.abort())

  const listener = () => setHash(window.location.hash)
  window.addEventListener('hashchange', listener)
  onCleanup(() => window.removeEventListener('hashchange', listener))
})
// On cleanup: removeEventListener runs first, then abort
```


## With `onMount`

`onCleanup` works inside `onMount` for one-time setup/teardown:

```tsx
onMount(() => {
  const handleResize = () => setWidth(window.innerWidth)
  window.addEventListener('resize', handleResize)
  onCleanup(() => window.removeEventListener('resize', handleResize))
})
```


## Where It Works

`onCleanup` must be called within a reactive context:

- Inside `createEffect`
- Inside `onMount`
- During component initialization

Calling it outside these contexts has no effect.
