---
title: How It Works
description: Two-phase compilation, hydration markers, and clean overrides — a technical overview
---

# How It Works

This page provides a technical overview of how BarefootJS transforms JSX into interactive server-rendered pages. The concepts here underpin all four design principles but are implementation details — you can use BarefootJS without understanding them.

## Two-Phase Compilation

The compiler transforms a single JSX source file into two separate outputs:

```
JSX Source
    ↓
[Phase 1] Analyze + Transform → IR (Intermediate Representation)
    ↓
[Phase 2a] IR → Marked Template  (server)
[Phase 2b] IR → Client JS        (browser)
```

**Phase 1** parses the JSX once and produces a JSON IR tree. The IR captures the component structure, reactive expressions, event handlers, and type information — independent of any backend.

**Phase 2** takes the IR and generates two outputs:

- **Marked Template** — An HTML template for your server, with `bf-*` attributes marking interactive elements. The adapter determines the output format.
- **Client JS** — A minimal script that creates signals, wires up effects, and binds event handlers to the marked elements.

### Example

Given this source:

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

Phase 1 produces an IR that records:
- A signal `count` with setter `setCount` and initial value `0`
- A reactive text expression `count()` → slot `s0`
- A click handler on the button → slot `s1`

Phase 2a produces a marked template:

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

Phase 2b produces client JS:

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

For deeper details, see [Compiler Internals](../advanced/compiler-internals.md) and [IR Schema Reference](../advanced/ir-schema.md).

## Hydration

BarefootJS uses **marker-driven** hydration to make server-rendered HTML interactive.

### Hydration Markers

The compiler inserts `bf-*` attributes into the marked template. These tell the client JS where to attach behavior:

| Marker | Purpose | Example |
|--------|---------|---------|
| `bf-s` | Component scope boundary (`~` prefix = child) | `<div bf-s="Counter_a1b2">`, `<div bf-s="~Item_c3d4">` |
| `bf` | Interactive element (slot) | `<p bf="s0">` |
| `bf-p` | Serialized props JSON | `<div bf-p='{"initial":5}'>` |
| `bf-c` | Conditional block | `<div bf-c="s2">` |
| `bf-po` | Portal owner scope ID | `<div bf-po="Dialog_a1b2">` |
| `bf-pi` | Portal container ID | `<div bf-pi="bf-portal-1">` |
| `bf-pp` | Portal placeholder | `<template bf-pp="bf-portal-1">` |
| `bf-i` | List item marker | `<li bf-i>` |

### Hydration Flow

1. The server renders HTML with markers and embeds component props in `bf-p` attributes
2. The browser loads the client JS
3. `hydrate()` finds all uninitialized `bf-s` elements
4. For each scope, the init function runs — creating signals, binding effects, attaching event handlers
5. The runtime tracks the scope internally to prevent double initialization
6. The page is now interactive

### Scoped Queries

`$()` and `$t()` search within a scope boundary, excluding nested component scopes.

```html
<div bf-s="TodoApp_x1">        <!-- TodoApp scope -->
  <h1 bf="s0">Todo</h1>            <!-- belongs to TodoApp -->
  <div bf-s="~TodoItem_y1">     <!-- TodoItem scope (excluded from TodoApp queries) -->
    <span bf="s0">Buy milk</span>
  </div>
</div>
```

When TodoApp's init calls `$(__scope, 's0')`, it finds the `<h1>`, not the `<span>` inside TodoItem. The `~` prefix on `bf-s` marks a child component scope, which is excluded from parent queries.

## Clean Overrides (CSS Layers)

BarefootJS uses CSS Cascade Layers to guarantee that user-supplied classes always override component base classes — no runtime JS, no merge functions, no generation-order concerns.

### How It Works

CSS Cascade Layers solve style conflicts: styles in a named `@layer` always lose to un-layered styles, regardless of specificity or source order. BarefootJS puts component base classes into `@layer components`. User-supplied classes remain un-layered:

```css
/* Layer ordering: lowest → highest priority */
@layer preflights, base, shortcuts, components, default;
```

The compiler's `cssLayerPrefix` option prefixes component base classes at compile time:

```tsx
// Source
const baseClasses = 'inline-flex items-center bg-primary text-primary-foreground'

// Compiled (with cssLayerPrefix: 'components')
const baseClasses = 'layer-components:inline-flex layer-components:items-center layer-components:bg-primary layer-components:text-primary-foreground'
```

The CSS toolchain (e.g., UnoCSS) emits those classes inside `@layer components`. User classes remain un-layered and always win:

```
<Button className="bg-red-500">

Applied classes:
  layer-components:bg-primary     → @layer components  (lower priority)
  bg-red-500                      → un-layered          (higher priority)

Result: bg-red-500 wins. Always.
```

- **Zero runtime cost** — Prefixing happens at compile time.
- **Works with any CSS tool** — Any tool with Cascade Layer support works.
- **Language-independent** — Prefixing is applied to the IR, so all adapters benefit equally.
