---
title: Component Authoring
description: Learn how to write server and client components in BarefootJS using JSX functions.
---

# Component Authoring

Components are functions that return JSX, in two kinds: **server components** and **client components**.


## Server Components

Server components render HTML on the server with no client-side JavaScript.

```tsx
export function Greeting({ name }: { name: string }) {
  return <h1>Hello, {name}</h1>
}
```

Server components can access databases, read files, and use secrets. They produce a template rendered once per request.


## Client Components

Client components use reactive primitives and ship JavaScript to the browser. They require the `"use client"` directive:

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

The compiler produces a **marked template** (server HTML with `bf-*` attributes) and **client JS** (signals, effects, event handlers). See [How It Works](../core-concepts/how-it-works.md#two-phase-compilation) for details.

### When `"use client"` Is Required

Add `"use client"` when a component uses:

- `createSignal`, `createEffect`, `createMemo`
- `onMount`, `onCleanup`, `untrack`
- `createContext`, `useContext`
- Event handlers (`onClick`, `onChange`, etc.)

Without the directive:

```
error[BF001]: 'use client' directive required for components with createSignal
```


## Component Naming

Component names must start with an uppercase letter:

```tsx
// ✅ Component
function TodoItem() { ... }

// ❌ Error BF042
function todoItem() { ... }
```


## Compilation Output

**Source:**

```tsx
"use client"
import { createSignal } from '@barefootjs/client'

export function Toggle() {
  const [on, setOn] = createSignal(false)

  return (
    <button onClick={() => setOn(prev => !prev)}>
      {on() ? 'ON' : 'OFF'}
    </button>
  )
}
```

**Marked template:**

<!-- tabs:adapter -->
<!-- tab:Hono -->
```tsx
export function Toggle({ __instanceId, ... }) {
  const __scopeId = __instanceId || `Toggle_${...}`
  const on = () => false

  return (
    <button bf-s={__scopeId} bf="s1">
      {on() ? <>{bfComment("cond-start:s0")}{'ON'}{bfComment("cond-end:s0")}</>
            : <>{bfComment("cond-start:s0")}{'OFF'}{bfComment("cond-end:s0")}</>}
    </button>
  )
}
```
<!-- tab:Go Template -->
```go-template
{{define "Toggle"}}
<button bf-s="{{bfScopeAttr .}}" bf="s1">
  {{if .On}}{{bfComment "cond-start:s0"}}{{"ON"}}{{bfComment "cond-end:s0"}}
  {{else}}{{bfComment "cond-start:s0"}}{{"OFF"}}{{bfComment "cond-end:s0"}}{{end}}
</button>
{{end}}
```
<!-- /tabs -->

**Client JS:**

```js
import { $, createSignal, hydrate, insert } from '@barefootjs/client-runtime'

export function initToggle(__scope, _p = {}) {
  if (!__scope) return

  const [on, setOn] = createSignal(false)

  const [_s1, _s0] = $(__scope, 's1', 's0')

  insert(__scope, 's0', () => on(), {
    template: () => `<!--bf-cond-start:s0-->ON<!--bf-cond-end:s0-->`,
    bindEvents: (__branchScope) => {}
  }, {
    template: () => `<!--bf-cond-start:s0-->OFF<!--bf-cond-end:s0-->`,
    bindEvents: (__branchScope) => {}
  })

  if (_s1) _s1.addEventListener('click', () => { setOn(prev => !prev) })
}

hydrate('Toggle', { init: initToggle, template: ... })
```

Only the conditional branch bound to `on()` updates when the signal changes. The `insert()` function handles DOM swapping using comment markers as boundaries.


## Composition Rules

| From | To | Allowed |
|------|----|---------|
| Server component | Server component | ✅ |
| Server component | Client component | ✅ |
| Client component | Client component | ✅ |
| Client component | Server component | ❌ |

Server-only code does not exist in the browser. The compiler emits `BF003` if a client component imports a server component.

```tsx
// Page.tsx — server component
import { Counter } from './Counter'    // "use client" ✅
import { UserList } from './UserList'  // server-only  ✅

export function Page() {
  return (
    <div>
      <UserList />   {/* Server → Server */}
      <Counter />    {/* Server → Client */}
    </div>
  )
}
```

```tsx
// Dashboard.tsx — "use client"
import { Counter } from './Counter'    // ✅ Client → Client
import { UserList } from './UserList'  // ❌ BF003: Client → Server
```

## Ref Callbacks

`ref` callbacks provide imperative DOM access. The callback receives the element after mount:

```tsx
"use client"
import { createEffect } from '@barefootjs/client'

export function AutoFocus() {
  const handleMount = (el: HTMLInputElement) => {
    el.focus()
  }

  return <input ref={handleMount} placeholder="Focused on mount" />
}
```

Combine with `createEffect` for reactive DOM updates:

```tsx
const handleMount = (el: HTMLElement) => {
  createEffect(() => {
    el.className = isActive() ? 'active' : 'inactive'
  })
}
```
