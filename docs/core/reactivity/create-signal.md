---
title: createSignal
description: Creates a reactive getter/setter pair for managing state.
---

# createSignal

Creates a reactive value. Returns a getter/setter pair.

```tsx
import { createSignal } from '@barefootjs/client'

const [getter, setter] = createSignal<T>(initialValue: T)
```

**Type:**

```tsx
type Reactive<T> = T & { readonly __reactive: true }

type Signal<T> = [
  Reactive<() => T>,                          // getter (carries Reactive brand)
  (valueOrFn: T | ((prev: T) => T)) => void  // setter
]
```

The getter carries the `Reactive<T>` phantom brand — a compile-time marker for reactive expression detection. No runtime cost.


## Basic Usage

```tsx
const [count, setCount] = createSignal(0)

// Read — call the getter
count() // 0

// Write — pass a value
setCount(5)
count() // 5

// Write — pass an updater function
setCount(n => n + 1)
count() // 6
```

The getter is a **function call** — `count()`, not `count`. This is how the reactivity system tracks dependencies.


## Equality Check

The setter uses `Object.is` to compare values. Identical values do not trigger effects:

```tsx
const [name, setName] = createSignal('Alice')
setName('Alice') // No effect runs — value unchanged
```

For objects and arrays, this means you need a new reference to trigger an update:

```tsx
const [todos, setTodos] = createSignal([{ text: 'Buy milk' }])

// ❌ Mutating the same array — no update
const list = todos()
list.push({ text: 'Walk dog' })
setTodos(list) // Same reference, Object.is returns true

// ✅ New array — triggers update
setTodos([...todos(), { text: 'Walk dog' }])
```


## With Effects

Reading a signal inside an effect subscribes the effect to changes:

```tsx
const [count, setCount] = createSignal(0)

createEffect(() => {
  console.log('Count is:', count()) // Runs whenever count changes
})

setCount(1) // Logs: "Count is: 1"
setCount(2) // Logs: "Count is: 2"
```


## With JSX

Signal getters in JSX expressions create fine-grained DOM updates:

```tsx
"use client"
import { createSignal } from '@barefootjs/client'

export function Counter() {
  const [count, setCount] = createSignal(0)

  return (
    <div>
      <p>{count()}</p>
      <button onClick={() => setCount(n => n + 1)}>+1</button>
    </div>
  )
}
```

The compiler generates an effect that updates only the `<p>` text content when `count` changes — the rest of the DOM is untouched.


## Type Inference

Type is inferred from the initial value:

```tsx
const [count, setCount] = createSignal(0)        // Signal<number>
const [name, setName] = createSignal('Alice')     // Signal<string>
const [visible, setVisible] = createSignal(false) // Signal<boolean>
```

For union types or complex types, specify the type parameter:

```tsx
const [user, setUser] = createSignal<User | null>(null)
const [filter, setFilter] = createSignal<'all' | 'active' | 'done'>('all')
```
