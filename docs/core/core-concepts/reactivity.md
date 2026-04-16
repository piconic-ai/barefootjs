---
title: Fine-grained Reactivity
description: Signal-based reactivity — no virtual DOM, updates at the DOM node level
---

# Fine-grained Reactivity

The compiler analyzes which DOM nodes depend on which signals and generates code that connects them at hydration. When state changes, only that DOM node updates — no virtual DOM, no component re-render.

Inspired by [SolidJS](https://www.solidjs.com/). The key difference from React: **components run once**, not on every state change.

## Signals, Effects, Memos

```tsx
const [count, setCount] = createSignal(0)     // reactive value
const doubled = createMemo(() => count() * 2)  // cached derived value

createEffect(() => {
  console.log('Count is:', count())            // re-runs when count changes
})

setCount(1)  // triggers the effect, recomputes doubled
```

The getter is a function call — `count()`, not `count`. The runtime tracks which signals each effect reads. No dependency arrays.

## How Updates Reach the DOM

```
setCount(1) → signal notifies subscribers → effect updates the DOM node
```

The compiler analyzed which DOM node depends on `count` and generated an effect that updates it directly. No tree diffing at runtime.

For the full API, see [Reactivity](../reactivity.md).
