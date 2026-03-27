---
title: Performance Optimization
description: Strategies to minimize bundle size, reduce hydration cost, and optimize runtime reactivity
---

# Performance Optimization

BarefootJS is designed for performance by default — server-side rendering with minimal client JavaScript. This guide covers strategies to minimize bundle size, reduce hydration cost, and optimize runtime reactivity.

## How BarefootJS Achieves Performance

### Zero-JS by Default

Components without reactive state generate **no client JavaScript at all**. Only components with `"use client"` produce client-side code:

```tsx
// Server-only — 0 bytes of client JS
export function Header() {
  return (
    <header>
      <h1>My App</h1>
      <nav>...</nav>
    </header>
  )
}
```

### Minimal Hydration

Unlike frameworks that ship the full component tree to the client, BarefootJS sends only:
- Signal initialization
- Event handler bindings
- Effect setup for reactive updates

The HTML structure is never re-created on the client — it was already rendered by the server.

---

## Reducing Client JS Size

### Minimize Signal Count

Each signal adds tracking overhead. Use `createMemo` for derived values instead of separate signals:

```tsx
// ❌ Redundant signal
const [count, setCount] = createSignal(0)
const [doubled, setDoubled] = createSignal(0)
createEffect(() => setDoubled(count() * 2))  // Extra signal + effect

// ✅ Use memo instead
const [count, setCount] = createSignal(0)
const doubled = createMemo(() => count() * 2)  // Computed, no extra signal
```

### Use Static Arrays When Possible

If a list doesn't change after initial render, the compiler detects it as a **static array** and skips list reconciliation:

```tsx
// Static — no reconciliation generated
const tabs = ['Home', 'About', 'Contact']
{tabs.map(tab => <Tab label={tab} />)}

// Dynamic — reconcileElements needed
const [items, setItems] = createSignal([...])
{items().map(item => <Item key={item.id} data={item} />)}
```

---

## Optimizing Hydration

### Use Keys for List Reconciliation

Always provide stable keys for dynamic lists. Without keys, the reconciler can't reuse DOM nodes:

```tsx
// ✅ Stable key — DOM nodes reused when list changes
{items().map(item => <li key={item.id}>{item.name}</li>)}

// ❌ Index key — DOM nodes recreated on reorder
{items().map((item, i) => <li key={i}>{item.name}</li>)}
```

### Preserve Focus in Lists

The reconciler automatically preserves focused elements during list updates. If a focused input is in a list item, it won't lose focus when the list re-renders. This is built-in — no action needed on your part.

---

## Optimizing Reactivity

### Use `untrack` for One-Time Reads

When you need a signal's current value without subscribing to changes:

```tsx
createEffect(() => {
  // Only re-runs when items() changes, not when count() changes
  const currentCount = untrack(() => count())
  console.log(`${items().length} items, count was ${currentCount}`)
})
```

### Avoid Effects for Derived Data

`createMemo` is cheaper than `createEffect` + `createSignal`:

```tsx
// ❌ Effect → Signal chain (two subscriptions)
const [total, setTotal] = createSignal(0)
createEffect(() => setTotal(price() * quantity()))

// ✅ Single memo (one subscription)
const total = createMemo(() => price() * quantity())
```

### Guard Effect Side Effects

Effects with the same result can skip expensive operations:

```tsx
createEffect(() => {
  const cls = isActive() ? 'active' : 'inactive'
  if (element.className !== cls) {
    element.className = cls  // Only touches DOM when value changes
  }
})
```

> **Note:** The compiler already generates guarded updates for text content and common attributes. This tip applies to custom effects.


