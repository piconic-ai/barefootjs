---
title: Reactivity
description: Signals, effects, memos, and lifecycle hooks — the reactive primitives that drive DOM updates.
---

# Reactivity

A signal is a getter/setter pair. Reading the getter inside an effect subscribes that effect; writing the setter re-runs it. The compiler finds which DOM nodes read which signals and wires one effect per node, so `setCount(1)` updates exactly the text node, attribute, or list row that reads `count()`. Components run once — there is no re-render and no virtual DOM.

All primitives are imported from `@barefootjs/client`:

```tsx
"use client"
import { createSignal, createEffect, createMemo, onMount, onCleanup, untrack, batch } from '@barefootjs/client'
```

```tsx
"use client"
import { createSignal, createMemo } from '@barefootjs/client'

export function Counter() {
  const [count, setCount] = createSignal(0)
  const doubled = createMemo(() => count() * 2)

  return (
    <div>
      <p>{count()} doubled is {doubled()}</p>
      <button onClick={() => setCount(n => n + 1)}>+1</button>
    </div>
  )
}
```

The getter is a function call — `count()`, not `count`. Dependencies are tracked from those calls; there are no dependency arrays. Clicking the button re-runs only the effect the compiler generated for the `<p>` text.

## API Reference

| API | Description |
|-----|-------------|
| [`createSignal`](./reactivity/create-signal.md) | Create a reactive value |
| [`createEffect`](./reactivity/create-effect.md) | Run side effects when dependencies change |
| [`createMemo`](./reactivity/create-memo.md) | Create a cached derived value |
| [`onMount`](./reactivity/on-mount.md) | Run once on component initialization |
| [`onCleanup`](./reactivity/on-cleanup.md) | Register cleanup for effects and lifecycle |
| [`untrack`](./reactivity/untrack.md) | Read signals without tracking dependencies |
| [`batch`](./reactivity/batch.md) | Group signal writes so subscribers run once |

## Guides

- [Props Reactivity](./reactivity/props-reactivity.md) — every way of reading a prop, including destructuring, is a live read
- [Context API](./components/context-api.md) — sharing state between components
