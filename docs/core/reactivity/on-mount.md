---
title: onMount
description: Runs a callback once when the component initializes, without tracking signal dependencies.
---

# onMount

Runs once when the component initializes. Signal reads inside it are not tracked, so it never re-runs.

```ts
import { onMount } from '@barefootjs/client'

onMount(fn: () => void): void
```

```tsx
onMount(() => {
  const onHashChange = () => setFilter(window.location.hash === '#/active' ? 'active' : 'all')
  window.addEventListener('hashchange', onHashChange)
  onCleanup(() => window.removeEventListener('hashchange', onHashChange))
})
```

## Runs during hydration

`onMount(fn)` is `createEffect(() => untrack(fn))`, so [`onCleanup`](./on-cleanup.md) works inside it and, like every effect, it runs synchronously during hydration. A signal written here changes the server-rendered DOM as soon as the component hydrates; if the value is knowable up front, seed the signal with it instead. See [Effects run during hydration](./create-effect.md#effects-run-during-hydration).
