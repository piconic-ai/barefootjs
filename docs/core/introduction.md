---
title: Introduction
description: What is BarefootJS, why it exists, and its design philosophy
---

# Introduction

## What is BarefootJS?

BarefootJS is a compiler that transforms JSX components into server-rendered templates and minimal client-side JavaScript.

Write familiar JSX with fine-grained reactivity — the compiler splits it into a **marked template** for your backend and a **tiny hydration script** for the browser.

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

This single file compiles into two outputs:

<!-- tabs:adapter -->
<!-- tab:Hono -->
**Marked template** — Renders static HTML with hydration markers:

```tsx
export function Counter({ __instanceId, ... }) {
  const __scopeId = __instanceId || `Counter_${Math.random().toString(36).slice(2, 8)}`
  const count = () => 0

  return (
    <button bf-s={__scopeId} bf="s1">
      Count: {bfText("s0")}{count()}{bfTextEnd()}
    </button>
  )
}
```

<!-- tab:Go Template -->
**Marked template** — Go `html/template` with hydration markers:

```go-template
{{define "Counter"}}
<button bf-s="{{bfScopeAttr .}}" bf="s1">
  Count: {{bfTextStart "s0"}}{{.Count}}{{bfTextEnd}}
</button>
{{end}}
```

<!-- /tabs -->

**Client script** — Wires up only the interactive parts:

```js
import { $, $t, createEffect, createSignal, hydrate } from '@barefootjs/client-runtime'

export function initCounter(__scope, _p = {}) {
  if (!__scope) return

  const [count, setCount] = createSignal(0)

  const [_s1] = $(__scope, 's1')       // find element with bf="s1"
  const [_s0] = $t(__scope, 's0')      // find text node at <!--bf:s0-->

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

No framework runtime. No virtual DOM. Just the minimum JavaScript needed for interactivity.


## Design Principles

**Backend Freedom.**
The same JSX source produces templates for Hono, Go `html/template`, and any future adapter. Your component library works across stacks. No Node.js lock-in — use the server language your team already knows.

**MPA-style development.**
Add interactive UI to existing server-rendered apps without adopting a full SPA framework. Each page is a normal route; client JavaScript is only loaded where you mark it.

**Fine-grained reactivity.**
Signals track dependencies at the expression level. When state changes, only the affected DOM nodes update — no virtual DOM diffing, no component-tree re-render. [Benchmarked at SolidJS-equivalent performance](https://github.com/barefootjs/barefootjs/issues/236), orders of magnitude faster than vDOM reconciliation.

**AI-native development.**
The compiler produces an IR that can be tested without a browser, enabling fast component tests via `renderToTest()`. Combined with a CLI for component discovery (`barefoot search`, `barefoot ui`), AI agents can autonomously scaffold, test, and iterate on UI components.
