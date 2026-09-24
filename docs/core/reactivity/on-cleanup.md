---
title: onCleanup
description: Registers a cleanup function that runs when the owning effect re-runs or the component is destroyed.
---

# onCleanup

Registers a cleanup function. It runs before the owning effect re-runs and when the component is destroyed.

```ts
import { onCleanup } from '@barefootjs/client'

onCleanup(fn: () => void): void
```

```tsx
createEffect(() => {
  const timer = setInterval(() => console.log('tick'), 1000)
  onCleanup(() => clearInterval(timer))
})
```

On re-run the previous interval is cleared before a new one is created. `onCleanup` can be called several times in one effect; cleanups run in reverse registration order (last registered, first called).

## Where it works

`onCleanup` needs a reactive context:

- inside `createEffect`
- inside [`onMount`](./on-mount.md)
- during component initialization (runs when the component is destroyed)

Outside these it is a no-op.
