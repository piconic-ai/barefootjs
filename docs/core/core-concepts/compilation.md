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

The server renders the HTML. The browser runs only the client JS to make it interactive.

## Adapters

An **adapter** converts the backend-agnostic IR to the template format your server needs. See [Adapters](../adapters.md) for details.

| Adapter | Output | Backend |
|---------|--------|---------|
| `HonoAdapter` | `.hono.tsx` | Hono / JSX-based servers |
| `GoTemplateAdapter` | `.tmpl` + `_types.go` | Go `html/template` |
