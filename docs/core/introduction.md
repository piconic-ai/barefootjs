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

**Compile, don't ship a runtime.**
The compiler does the heavy lifting at build time. The browser receives only the JavaScript it needs — no framework, no virtual DOM diffing.

**Backend agnostic.**
The same JSX source produces templates for Hono, Go `html/template`, and any future adapter. Your component library works across stacks.

**Fine-grained reactivity.**
Inspired by SolidJS, signals track dependencies at the expression level. When state changes, only the affected DOM nodes update — not the entire component tree.

**Progressive enhancement.**
Server-rendered HTML works without JavaScript. Client scripts add interactivity. If JavaScript fails to load, users still see content.

**Full type safety.**
TypeScript types flow through the entire compilation pipeline.

**No lock-in.**
JSX is the authoring format, but the output is standard HTML and vanilla JavaScript. No proprietary template language. No framework to migrate away from.
