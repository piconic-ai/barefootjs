---
title: Two-Phase Compilation
description: How BarefootJS compiles JSX into marked templates and client JS
---

# Two-Phase Compilation

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

## Example

Given this source:

```tsx
"use client"
import { createSignal } from '@barefootjs/client'

export function Counter({ initial = 0 }) {
  const [count, setCount] = createSignal(initial)

  return (
    <div>
      <p>{count()}</p>
      <button onClick={() => setCount(n => n + 1)}>+1</button>
    </div>
  )
}
```

Phase 1 produces an IR that records:
- A signal `count` with setter `setCount` and initial value `initial`
- A reactive expression `count()` at `slot_0`
- A click handler on the button at `slot_1`

Phase 2a produces a marked template:

<!-- tabs:adapter -->
<!-- tab:Hono -->
```tsx
export function Counter(props) {
  return (
    <div bf-s="Counter">
      <p bf="slot_0">{props.initial ?? 0}</p>
      <button bf="slot_1">+1</button>
    </div>
  )
}
```
<!-- tab:Go Template -->
```go-template
{{define "Counter"}}
<div bf-s="{{.ScopeID}}">
  <p bf="slot_0">{{.Initial}}</p>
  <button bf="slot_1">+1</button>
</div>
{{end}}
```
<!-- /tabs -->

Phase 2b produces client JS:

```js
import { createSignal, createEffect, find, hydrate } from '@barefootjs/client'

export function initCounter(__scope, props = {}) {
  const [count, setCount] = createSignal(props.initial ?? 0)

  const _slot_0 = find(__scope, '[bf="slot_0"]')
  const _slot_1 = find(__scope, '[bf="slot_1"]')

  createEffect(() => {
    if (_slot_0) _slot_0.textContent = String(count())
  })

  if (_slot_1) _slot_1.onclick = () => setCount(n => n + 1)
}

hydrate('Counter', { init: initCounter })
```

The server renders the HTML. The browser runs only the client JS to make it interactive.

## Adapters

An **adapter** converts the backend-agnostic IR to the template format your server needs. See [Adapters](../adapters.md) for details.

| Adapter | Output | Backend |
|---------|--------|---------|
| `HonoAdapter` | `.hono.tsx` | Hono / JSX-based servers |
| `GoTemplateAdapter` | `.tmpl` + `_types.go` | Go `html/template` |
