---
title: How It Works
description: Two-phase compilation and hydration markers
---

# How It Works

## Two-Phase Compilation

One JSX source file produces two outputs:

```
JSX Source
    ↓
[Phase 1] Analyze + Transform → IR (Intermediate Representation)
    ↓
[Phase 2a] IR → Marked Template  (server)
[Phase 2b] IR → Client JS        (browser)
```

**Phase 1** produces a JSON IR tree — component structure, reactive expressions, event handlers, type information. Backend-independent.

**Phase 2** generates:

- **Marked Template** — HTML with `bf-*` attributes marking interactive elements. The adapter determines the format.
- **Client JS** — Creates signals, wires effects, binds event handlers to marked elements.

### Counter Example

Source:

```tsx
"use client"
import { createSignal } from '@barefootjs/client'

export function Counter() {
  const [count, setCount] = createSignal(0)

  return (
    <button onClick={() => setCount(n => n + 1)}>
      Count: {count()}
    </button>
  )
}
```

The IR records:
- Signal `count` with initial value `0`
- Reactive text expression `count()` → slot `s0`
- Click handler on button → slot `s1`

Marked template (Phase 2a):

<!-- tabs:adapter -->
<!-- tab:Hono -->
```tsx
export function Counter({ __instanceId, ... }) {
  const __scopeId = __instanceId || `Counter_${Math.random().toString(36).slice(2, 8)}`
  const count = () => 0   // server-side stub

  return (
    <button bf-s={__scopeId} bf="s1">
      Count: {bfText("s0")}{count()}{bfTextEnd()}
    </button>
  )
}
```
<!-- tab:Go Template -->
```go-template
{{define "Counter"}}
<button bf-s="{{bfScopeAttr .}}" bf="s1">
  Count: {{bfTextStart "s0"}}{{.Count}}{{bfTextEnd}}
</button>
{{end}}
```
<!-- /tabs -->

Client JS (Phase 2b):

```js
import { $, $t, createEffect, createSignal, hydrate } from '@barefootjs/client-runtime'

export function initCounter(__scope, _p = {}) {
  if (!__scope) return

  const [count, setCount] = createSignal(0)

  const [_s1] = $(__scope, 's1')       // element lookup
  const [_s0] = $t(__scope, 's0')      // text node lookup

  createEffect(() => {
    const __val = count()
    if (_s0) _s0.nodeValue = String(__val ?? '')
  })

  if (_s1) _s1.addEventListener('click', () => { setCount(n => n + 1) })
}

hydrate('Counter', {
  init: initCounter,
  template: (_p) => `<button bf="s1"> Count: <!--bf:s0-->${(0)}<!--/--></button>`
})
```

See [Compiler Internals](../advanced/compiler-internals.md) and [IR Schema Reference](../advanced/ir-schema.md).

## Hydration

Marker-driven hydration attaches behavior to server-rendered HTML.

### Markers

`bf-*` attributes in the marked template tell client JS where to attach:

| Marker | Purpose | Example |
|--------|---------|---------|
| `bf-s` | Component scope boundary (`~` = child) | `<div bf-s="Counter_a1b2">` |
| `bf` | Interactive element (slot) | `<p bf="s0">` |
| `bf-p` | Serialized props JSON | `<div bf-p='{"initial":5}'>` |
| `bf-c` | Conditional block | `<div bf-c="s2">` |
| `bf-po` | Portal owner scope ID | `<div bf-po="Dialog_a1b2">` |
| `bf-pi` | Portal container ID | `<div bf-pi="bf-portal-1">` |
| `bf-pp` | Portal placeholder | `<template bf-pp="bf-portal-1">` |
| `bf-i` | List item marker | `<li bf-i>` |

### Flow

1. Server renders HTML with markers, embeds props in `bf-p`
2. Browser loads client JS
3. `hydrate()` finds uninitialized `bf-s` elements
4. Init function runs per scope — signals, effects, handlers
5. Runtime tracks scopes to prevent double initialization

### Scoped Queries

`$()` and `$t()` search within a scope, excluding child component scopes:

```html
<div bf-s="TodoApp_x1">
  <h1 bf="s0">Todo</h1>
  <div bf-s="~TodoItem_y1">
    <span bf="s0">Buy milk</span>
  </div>
</div>
```

`$(__scope, 's0')` in TodoApp finds `<h1>`, not the `<span>` inside TodoItem. The `~` prefix marks a child scope excluded from parent queries.
