---
title: Component Authoring
description: Write server and client components, compose them, type their props, and reach the DOM with ref callbacks.
---

# Component Authoring

A component is a function that returns JSX. There are two kinds: **server components** and **client components**.


## Server components

A server component has no directive and ships no JavaScript. It renders once per request, so it can read databases, files, and secrets.

```tsx
export function Greeting({ name }: { name: string }) {
  return <h1>Hello, {name}</h1>
}
```


## Client components

A client component starts with `"use client"`. The compiler turns it into a marked template (server HTML with `bf-*` attributes) plus client JS for its signals, effects, and event handlers — see [How It Works](../how-it-works.mdx).

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

### When `"use client"` is required

Add the directive when a component uses:

- `createSignal`, `createEffect`, `createMemo`
- `onMount`, `onCleanup`, `untrack`
- `createContext`, `useContext`
- Event handlers (`onClick`, `onChange`, etc.)

Without it the build stops:

```
error[BF001]: 'use client' directive required for components with createSignal
```

Component names must start with an uppercase letter (`TodoItem`, not `todoItem`); a lowercase name is error `BF042`.


## Composition rules

| From | To | Allowed |
|------|----|---------|
| Server component | Server component | ✅ |
| Server component | Client component | ✅ |
| Client component | Client component | ✅ |
| Client component | Server component | ❌ |

Server-only code does not exist in the browser, so a client component cannot import a server component. The compiler reports `BF003`:

```tsx
// Dashboard.tsx — "use client"
import { Counter } from './Counter'    // ✅ Client → Client
import { UserList } from './UserList'  // ❌ BF003: Client → Server
```


## Props

Type props with an interface. In client components props are reactive — see [Props Reactivity](../reactivity/props-reactivity.md).

```tsx
interface GreetingProps {
  name: string
  greeting?: string
}

export function Greeting(props: GreetingProps) {
  return <h1>{props.greeting ?? 'Hello'}, {props.name}</h1>
}
```

Give a prop a default with `??` on the props object, or with a destructure default. Both stay reactive.

```tsx
function Badge(props: { variant?: 'default' | 'primary'; children?: Child }) {
  const variant = props.variant ?? 'default'
  return <span className={variant}>{props.children}</span>
}
```

```tsx
"use client"
import { createSignal } from '@barefootjs/client'

export function Counter({ initial = 0 }: { initial?: number }) {
  const [count, setCount] = createSignal(initial)
  return <button onClick={() => setCount(n => n + 1)}>{count()}</button>
}
```

A component that wraps a native element extends the matching attribute type from `@barefootjs/jsx`, so callers can pass `type`, `disabled`, `aria-label`, and any other standard attribute alongside its own props:

```tsx
import type { ButtonHTMLAttributes } from '@barefootjs/jsx'

interface ButtonProps extends ButtonHTMLAttributes {
  variant?: 'default' | 'primary' | 'destructive'
}

function Button(props: ButtonProps) {
  const variant = props.variant ?? 'default'
  const classes = `btn btn-${variant} ${props.className ?? ''}`

  return <button className={classes} {...props}>{props.children}</button>
}
```


## Ref callbacks

A `ref` callback receives the element after it mounts, for imperative DOM access:

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

Wrap DOM writes in `createEffect` inside the callback to keep them in sync with a signal:

```tsx
const handleMount = (el: HTMLElement) => {
  createEffect(() => {
    el.className = isActive() ? 'active' : 'inactive'
  })
}
```
