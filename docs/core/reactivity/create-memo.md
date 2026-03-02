# createMemo

Creates a cached derived value. Recomputes only when its dependencies change.

```tsx
import { createMemo } from '@barefootjs/dom'

const getter = createMemo<T>(fn: () => T): Memo<T>
```

Returns a read-only getter function typed as `Memo<T>` (alias for `Reactive<() => T>`). The `Reactive<T>` brand is a compile-time marker that the compiler uses to identify reactive expressions.


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

For simple expressions used only once, a memo is not necessary — the signal getter in JSX is sufficient:

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

Internally, `createMemo` is sugar over `createSignal` + `createEffect` — it creates a signal and an effect that updates it when dependencies change. This means a memo behaves exactly like a read-only signal to the rest of the reactive system.
