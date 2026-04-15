---
title: Performance Optimization
description: Strategies to minimize bundle size, reduce hydration cost, and optimize runtime reactivity
---

# Performance Optimization

## Zero-JS by Default

Components without `"use client"` generate **no client JavaScript**:

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

## Minimal Hydration

Only signals, event handlers, and effects are sent to the client. The HTML structure is never re-created — the server already rendered it.

---

## Reducing Client JS Size

### Use Memos for Derived Values

```tsx
// ❌ Redundant signal
const [count, setCount] = createSignal(0)
const [doubled, setDoubled] = createSignal(0)
createEffect(() => setDoubled(count() * 2))  // Extra signal + effect

// ✅ Use memo instead
const [count, setCount] = createSignal(0)
const doubled = createMemo(() => count() * 2)  // Computed, no extra signal
```

### Prefer Static Arrays

The compiler detects static arrays and skips reconciliation:

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

### Stable Keys for Lists

```tsx
// ✅ Stable key — DOM nodes reused when list changes
{items().map(item => <li key={item.id}>{item.name}</li>)}

// ❌ Index key — DOM nodes recreated on reorder
{items().map((item, i) => <li key={i}>{item.name}</li>)}
```

### Focus Preservation

The reconciler preserves focused elements during list updates automatically.

---

## Optimizing Reactivity

### `untrack` for One-Time Reads

```tsx
createEffect(() => {
  // Only re-runs when items() changes, not when count() changes
  const currentCount = untrack(() => count())
  console.log(`${items().length} items, count was ${currentCount}`)
})
```

### Memo Over Effect + Signal

```tsx
// ❌ Effect → Signal chain (two subscriptions)
const [total, setTotal] = createSignal(0)
createEffect(() => setTotal(price() * quantity()))

// ✅ Single memo (one subscription)
const total = createMemo(() => price() * quantity())
```

### Guard DOM Updates

```tsx
createEffect(() => {
  const cls = isActive() ? 'active' : 'inactive'
  if (element.className !== cls) {
    element.className = cls  // Only touches DOM when value changes
  }
})
```

The compiler already generates guarded updates for text content and common attributes. This applies to custom effects only.


