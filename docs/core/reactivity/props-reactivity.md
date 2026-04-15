---
title: Props Reactivity
description: How prop access patterns determine whether reactive updates propagate in BarefootJS components.
---

# Props Reactivity

**How you access props determines whether updates propagate.** The compiler wraps dynamic prop expressions in getters.


## Direct Access — Reactive

`props.xxx` maintains reactivity. Each access calls the underlying getter:

```tsx
function Display(props: { value: number }) {
  createEffect(() => {
    console.log(props.value) // Re-runs when parent updates value
  })
  return <span>{props.value}</span>
}
```


## Destructuring — Captures Once

Destructuring calls the getter once and stores the result. The value does not update:

```tsx
function Display({ value }: { value: number }) {
  createEffect(() => {
    console.log(value) // Stale — captured at component init
  })
  return <span>{value}</span>
}
```

The compiler emits `BF043` when it detects props destructuring in a client component:

```
warning[BF043]: Props destructuring breaks reactivity

  --> src/components/Display.tsx:1:18
   |
 1 | function Display({ value }: { value: number }) {
   |                  ^^^^^^^^^
   |
   = help: Access props via `props.value` to maintain reactivity
```

Suppress with `@bf-ignore` when capturing intentionally (e.g., initial values):

```tsx
// @bf-ignore props-destructuring
function Counter({ initial }: { initial: number }) {
  const [count, setCount] = createSignal(initial)
  return <button onClick={() => setCount(n => n + 1)}>{count()}</button>
}
```


## When Destructuring Is Safe

Destructuring is safe for **initial values** of local state and for values that never change (`id`, static labels).


## Summary

| Pattern | Reactive? | Use when |
|---------|-----------|----------|
| `props.value` | Yes | You need live updates from parent |
| `const { value } = props` | No | Value is used once (e.g., initial state) |
| `createSignal(props.value)` | `props.value` is reactive, signal is independent | Creating local state from a prop |


## How It Works

The compiler transforms dynamic prop expressions into getters:

```tsx
// Parent
<Child value={count()} />

// Compiled props object
{ get value() { return count() } }
```

- `props.value` → calls getter → calls `count()` → dependency tracked
- `const { value } = props` → calls getter once → stores the number → no further tracking

This is the same model as SolidJS. If you are coming from React, this is the key behavioral difference.
