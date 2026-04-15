---
title: '"use client" Directive'
description: Marking components for client-side interactivity
---

# The `"use client"` Directive

Components with reactive primitives (`createSignal`, `createEffect`, etc.) require `"use client"` at the top of the file:

```tsx
"use client"
import { createSignal } from '@barefootjs/client'

export function Counter() {
  const [count, setCount] = createSignal(0)
  // ...
}
```

The directive tells the compiler to generate client JS and add hydration markers to the template. Without it, the compiler produces a server-only template. Using reactive APIs without the directive triggers an error:

```
error[BF001]: 'use client' directive required for components with createSignal

  --> src/components/Counter.tsx:3:1
   |
 3 | import { createSignal } from '@barefootjs/client'
   | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
   |
   = help: Add "use client" at the top of the file
```

## Security Boundary

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

```tsx
// counter.tsx — "use client"
// This code ships to the browser. No secrets here.
"use client"
import { createSignal } from '@barefootjs/client'

export function Counter() {
  const [count, setCount] = createSignal(0)
  return <button onClick={() => setCount(n => n + 1)}>{count()}</button>
}
```

## Server and Client Component Composition

Composition follows a one-way rule:

- **Server → Client**: Allowed. The server renders HTML with hydration markers; the client JS takes over.
- **Client → Client**: Allowed.
- **Client → Server**: Not allowed. Server-only code does not exist on the client.

```tsx
// Page.tsx — server component
// ✅ Can use client components as children
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

```tsx
// Dashboard.tsx — "use client"
import { Counter } from './Counter'    // ✅ Client → Client
import { UserList } from './UserList'  // ❌ Client → Server (error)
```

Once you cross into client territory, everything below must also be a client component.
