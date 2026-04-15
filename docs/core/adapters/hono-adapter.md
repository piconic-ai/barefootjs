---
title: Hono Adapter
description: Generate Hono JSX templates from the compiler's IR for Hono-based servers.
---

# Hono Adapter

Generates Hono JSX (`.hono.tsx`) files from the compiler's IR. Works with Hono and any JSX-compatible TypeScript backend.

```
npm install @barefootjs/hono
```


## Basic Usage

```typescript
import { compile } from '@barefootjs/jsx'
import { HonoAdapter } from '@barefootjs/hono'

const adapter = new HonoAdapter()
const result = compile(source, { adapter })

// result.template  → .hono.tsx file content
// result.clientJs  → .client.js file content
```


## Options

```typescript
const adapter = new HonoAdapter({
  clientJsBasePath: '/static/components/',
  barefootJsPath: '/static/components/barefoot.js',
  clientJsFilename: 'my-component.client.js',
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `clientJsBasePath` | `string` | `'/static/components/'` | Base path for client JS files |
| `barefootJsPath` | `string` | `'/static/components/barefoot.js'` | Path to the BarefootJS runtime |
| `clientJsFilename` | `string` | `'{componentName}.client.js'` | Override the client JS filename |


## Output Format

### Server Component

Without `"use client"`, no hydration markers or client JS:

**Source:**

```tsx
export function Greeting({ name }: { name: string }) {
  return <h1>Hello, {name}</h1>
}
```

**Output (.hono.tsx):**

```tsx
export function Greeting({ name }: { name: string }) {
  return <h1>Hello, {name}</h1>
}
```

### Client Component

**Source:**

```tsx
"use client"
import { createSignal } from '@barefootjs/client'

export function Counter({ initial = 0 }: { initial?: number }) {
  const [count, setCount] = createSignal(initial)

  return (
    <div>
      <p>{count()}</p>
      <button onClick={() => setCount(n => n + 1)}>+1</button>
    </div>
  )
}
```

**Output (.hono.tsx):**

```tsx
export function Counter({ initial = 0, __instanceId, __bfScope }: CounterPropsWithHydration) {
  const __scopeId = __instanceId || `Counter_${Math.random().toString(36).slice(2, 8)}`
  const count = () => initial ?? 0
  const setCount = () => {}

  return (
    <div bf-s={__scopeId} {...(__bfPropsJson ? { "bf-p": __bfPropsJson } : {})}>
      <p bf="slot_0">{count()}</p>
      <button bf="slot_1">+1</button>
    </div>
  )
}
```

- `bf-s` — component boundary
- `bf="slot_N"` — client JS targets
- Signal stubs (`count = () => initial ?? 0`) — render initial values server-side
- `bf-p` — serialized props for client hydration
- Event handlers are removed (client JS only)


## Script Collection

A build-time post-processing step injects `useRequestContext()` calls into generated templates. `BfScripts` renders the collected `<script>` tags:

```tsx
import { BfScripts } from '@barefootjs/hono'

export function Layout({ children }) {
  return (
    <html>
      <body>
        {children}
        <BfScripts />
      </body>
    </html>
  )
}
```

Each component's client JS loads once regardless of instance count. See `site/ui/build.ts` for the `addScriptCollection()` pattern.


## Hydration Props

Every client component's props are extended with hydration fields:

| Prop | Purpose |
|------|---------|
| `__instanceId` | Unique instance identifier passed from the parent |
| `__bfScope` | Parent's scope ID (for nested component communication) |
| `__bfChild` | Marks this component as a child instance (adds `~` prefix to `bf-s` value) |
| `data-key` | Stable key for list-rendered instances |

These are used internally — no manual passing needed.


## Conditional Rendering

Ternaries compile with `bf-c` markers:

**Source:**

```tsx
{isActive() ? <span>Active</span> : <span>Inactive</span>}
```

**Output:**

```tsx
{isActive() ? <span bf-c="slot_2">Active</span> : <span bf-c="slot_2">Inactive</span>}
```

## Loop Rendering

**Source:**

```tsx
{items().map(item => <li>{item.name}</li>)}
```

**Output:**

```tsx
{items().map(item => <li>{item.name}</li>)}
```

For child components in loops, the adapter generates unique instance IDs per iteration using the loop index or `key`.
