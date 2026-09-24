---
title: createSignal
description: Creates a reactive getter/setter pair for managing state.
---

# createSignal

Creates a reactive value and returns a getter/setter pair.

```ts
import { createSignal } from '@barefootjs/client'

const [getter, setter] = createSignal<T>(initialValue: T)
```

```tsx
const [count, setCount] = createSignal(0)

count()              // 0 — read by calling the getter
setCount(5)          // write a value
setCount(n => n + 1) // write with an updater function; count() is now 6
```

The getter is a function call — `count()`, not `count`. That call is what registers a dependency. The type is inferred from the initial value; pass a type parameter for unions: `createSignal<User | null>(null)`.

## Equality check

The setter compares with `Object.is`. Setting the same value does nothing, so an object or array needs a new reference to trigger an update:

```tsx
const [todos, setTodos] = createSignal([{ text: 'Buy milk' }])

// ❌ Mutating the same array — no update
const list = todos()
list.push({ text: 'Walk dog' })
setTodos(list) // Same reference, Object.is returns true

// ✅ New array — triggers update
setTodos([...todos(), { text: 'Walk dog' }])
```

## See also

- [`createMemo`](./create-memo.md) — values derived from signals
- [`batch`](./batch.md) — group several writes into one update
