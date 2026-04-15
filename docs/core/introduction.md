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

This single file compiles into two outputs:

<!-- tabs:adapter -->
<!-- tab:Hono -->
**Marked template** — Renders static HTML with hydration markers:

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
**Marked template** — Go `html/template` with hydration markers:

```go-template
{{define "Counter"}}
<div bf-s="{{.ScopeID}}">
  <p bf="slot_0">{{.Initial}}</p>
  <button bf="slot_1">+1</button>
</div>
{{end}}
```

<!-- /tabs -->

**Client script** — Wires up only the interactive parts:

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
