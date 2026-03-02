---
title: Signal-Based Reactivity
description: Fine-grained reactivity with signals, effects, and memos
---

# Signal-Based Reactivity

BarefootJS uses fine-grained reactivity inspired by SolidJS. The core primitives are **signals**, **effects**, and **memos**.

All reactive getters carry the `Reactive<T>` phantom brand — a compile-time type marker that the compiler uses to identify reactive expressions. The brand has no runtime cost; it enables the compiler to detect reactivity via TypeScript's type system rather than name-based pattern matching alone.

## Signals

A signal holds a reactive value. It returns a getter/setter pair:

```tsx
const [count, setCount] = createSignal(0)

count()              // Read: returns 0
setCount(5)          // Write: set to 5
setCount(n => n + 1) // Write: updater function
```

The getter is a **function call** — `count()`, not `count`. This is how the reactivity system tracks which effects depend on which signals. The getter is typed as `Reactive<() => T>`, which the compiler recognizes as a reactive expression.

## Effects

An effect runs a function whenever its signal dependencies change:

```tsx
createEffect(() => {
  console.log('Count is:', count())
})
```

The first time it runs, the system records that `count` was read. When `count` changes, the effect re-runs automatically. No dependency array is needed.

## Memos

A memo is a cached derived value:

```tsx
const doubled = createMemo(() => count() * 2)

doubled() // Returns the cached result
```

Like effects, memos track dependencies automatically. Unlike effects, they return a value and only recompute when dependencies change.

## How It Works

When a signal getter is called inside an effect, the effect subscribes to that signal. When the setter is called, all subscribed effects re-run. This happens at the **expression level** — only the specific DOM nodes that depend on a signal are updated.

```
setCount(1)
    ↓
Signal notifies subscribers
    ↓
Effect re-runs: _slot_0.textContent = String(count())
    ↓
Only <p> updates. The rest of the DOM is untouched.
```

For the full API reference, see [Reactivity](../reactivity.md).
