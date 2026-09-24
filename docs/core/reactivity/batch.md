---
title: batch
description: Groups multiple signal writes so dependent effects and memos run once, after all writes complete.
---

# batch

Groups several signal writes so that each dependent effect or memo runs once, after all the writes complete. Returns the callback's result.

```ts
import { batch } from '@barefootjs/client'

batch<T>(fn: () => T): T
```

Writes propagate synchronously. Without `batch`, each setter call re-runs its subscribers immediately, so a subscriber shared by two writes runs twice and sees a half-updated state in between:

```tsx
const [x, setX] = createSignal(40)
const [y, setY] = createSignal(60)
createEffect(() => send({ x: x(), y: y() }))

setX(70) // effect runs — sees x=70, y=60
setY(30) // effect runs again — sees x=70, y=30
```

Inside `batch`, subscribers are de-duplicated and run once after the batch ends:

```tsx
batch(() => {
  setX(70)
  setY(30)
})
// effect runs once, sees x=70, y=30
```

## When to use

When one handler writes several signals that feed the same effects or memos. `batch` is opt-in: forgetting it is never a correctness bug, only extra subscriber runs.

## Caveats

- Memos read inside the batch are stale until it ends; read them after the batch.
- `await` inside the callback ends the batch — only the writes before the first `await` are grouped. Wrap each synchronous group in its own `batch`.
- One signal feeding an effect through two memos (a diamond) can still glitch once: `batch` de-duplicates the subscribers of the written signals, not of the memos they update.
