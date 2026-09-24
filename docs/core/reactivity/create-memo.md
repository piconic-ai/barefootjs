---
title: createMemo
description: Creates a cached derived value that recomputes only when its dependencies change.
---

# createMemo

Creates a cached derived value. It recomputes only when a signal it reads changes, and other effects read it like a signal.

```ts
import { createMemo } from '@barefootjs/client'

const getter = createMemo<T>(fn: () => T): Memo<T>
```

```tsx
const [todos, setTodos] = createSignal<Todo[]>([])
const [filter, setFilter] = createSignal<'all' | 'active' | 'done'>('all')

const filteredTodos = createMemo(() => {
  const list = todos()
  switch (filter()) {
    case 'active': return list.filter(t => !t.done)
    case 'done':   return list.filter(t => t.done)
    default:       return list
  }
})

createEffect(() => console.log(filteredTodos().length))
```

Use a memo when a derived value is read in several places or costs something to compute. A one-off expression can stay inline: `<p>{count() * 2}</p>`.

## Memo vs effect

| | `createMemo` | `createEffect` |
|---|---|---|
| Returns a value | Yes (getter) | No |
| Triggers other effects | Yes (acts as a signal) | No |
| Used for | Derived data | Side effects (DOM, fetch, logging) |
