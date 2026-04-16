---
title: Backend Freedom
description: How adapters let the same JSX run on any server — Hono, Go, and beyond
---

# Backend Freedom

> **Design Principle — Backend Freedom.**
> The same JSX source produces templates for Hono, Go `html/template`, and any future adapter. Your component library works across stacks. No Node.js lock-in — use the server language your team already knows.

## One Source, Any Backend

BarefootJS compiles JSX into a backend-agnostic **Intermediate Representation** (IR). An **adapter** then converts the IR into the template format your server needs:

```
JSX Source
    ↓
  Compiler → IR (backend-agnostic)
    ↓
  Adapter → Template for your backend
```

| Adapter | Output | Backend |
|---------|--------|---------|
| `HonoAdapter` | `.hono.tsx` | Hono / JSX-based servers |
| `GoTemplateAdapter` | `.tmpl` + `_types.go` | Go `html/template` |

Because the IR is independent of any server framework, the same component works unchanged across all supported backends. You can switch backends or support multiple backends from a single component library.

## The `"use client"` Directive

Components with reactive primitives (`createSignal`, `createEffect`, etc.) require `"use client"` at the top of the file:

```tsx
"use client"
import { createSignal } from '@barefootjs/client'

export function Counter() {
  const [count, setCount] = createSignal(0)
  return <button onClick={() => setCount(n => n + 1)}>{count()}</button>
}
```

The directive tells the compiler to generate client JS and add hydration markers to the template. Without it, the compiler produces a server-only template. Using reactive APIs without the directive triggers error `BF001`.

### Security Boundary

`"use client"` marks a **security boundary**. Code in a client component runs in the browser and is visible to the user. Never include secrets, database access, or other sensitive logic in a `"use client"` file.

```tsx
// server-only.tsx — NO "use client"
// This code stays on the server. Safe for secrets.
export function UserList() {
  const users = db.query('SELECT * FROM users')
  return (
    <ul>
      {users.map(u => <li>{u.name}</li>)}
    </ul>
  )
}
```

### Server and Client Component Composition

Composition follows a one-way rule:

- **Server → Client**: Allowed. The server renders HTML with hydration markers; the client JS takes over.
- **Client → Client**: Allowed.
- **Client → Server**: Not allowed. Server-only code does not exist on the client.

```tsx
// Page.tsx — server component
import { Counter } from './Counter'    // "use client"
import { UserList } from './UserList'  // server-only

export function Page() {
  return (
    <div>
      <UserList />   {/* ✅ Server → Server */}
      <Counter />    {/* ✅ Server → Client */}
    </div>
  )
}
```

Once you cross into client territory, everything below must also be a client component.

## Writing a Custom Adapter

The IR contract is stable, so you can write adapters for any backend. See [Adapter Architecture](../adapters/adapter-architecture.md) for the `TemplateAdapter` interface and [Writing a Custom Adapter](../adapters/custom-adapter.md) for a step-by-step guide.
