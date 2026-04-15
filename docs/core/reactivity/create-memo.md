---
title: createMemo
description: Creates a cached derived value that recomputes only when its dependencies change.
---

# createMemo

Creates a cached derived value. Recomputes only when its dependencies change.

```tsx
import { createMemo } from '@barefootjs/client'

const getter = createMemo<T>(fn: () => T): Memo<T>
```

Returns a read-only getter typed as `Memo<T>` (alias for `Reactive<() => T>`).


## Basic Usage

```tsx
const [count, setCount] = createSignal(2)
const doubled = createMemo(() => count() * 2)

doubled() // 4
setCount(5)
doubled() // 10
```


## When to Use

Use `createMemo` when you have a **derived value** that:

- Depends on one or more signals
- Is used in multiple places (avoids recalculating)
- Involves a non-trivial computation

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

// Used in multiple effects and JSX expressions
createEffect(() => console.log(filteredTodos().length))
```

For simple expressions used once, a memo is unnecessary:

```tsx
// No memo needed
<p>{count() * 2}</p>
```


## Chaining Memos

Memos can depend on other memos:

```tsx
const [count, setCount] = createSignal(1)
const doubled = createMemo(() => count() * 2)
const quadrupled = createMemo(() => doubled() * 2)

createEffect(() => {
  console.log(quadrupled()) // 4
})

setCount(3) // Logs: 12 (3 → 6 → 12)
```

Each memo in the chain only recomputes when its direct dependencies change.


## Memo vs Effect

| | `createMemo` | `createEffect` |
|---|---|---|
| Returns a value | Yes (getter function) | No |
| Triggers other effects | Yes (acts as a signal) | No |
| Used for | Derived data | Side effects (DOM, fetch, logging) |

Internally, `createMemo` is sugar over `createSignal` + `createEffect`. A memo behaves like a read-only signal to the rest of the reactive system.
