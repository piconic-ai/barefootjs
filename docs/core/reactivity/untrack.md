---
title: untrack
description: Executes a function without tracking signal dependencies in the current reactive context.
---

# untrack

Runs a function without tracking the signals it reads, and returns its result.

```ts
import { untrack } from '@barefootjs/client'

untrack<T>(fn: () => T): T
```

```tsx
const [count, setCount] = createSignal(0)
const [name, setName] = createSignal('Alice')

createEffect(() => {
  console.log('count:', count())              // tracked
  console.log('name:', untrack(() => name())) // not tracked
})

setCount(1)    // effect re-runs
setName('Bob') // effect does not re-run
```

## Gotcha

`untrack` stops the subscription, not the re-execution. When the surrounding effect re-runs for any other reason, the untracked code runs again. Every reactive binding on one element shares a single effect, so an untracked expression in one attribute is re-evaluated whenever another attribute on that element changes. If the computation itself is what you want to avoid repeating, use [`createMemo`](./create-memo.md) — it re-runs only when its own inputs change.
