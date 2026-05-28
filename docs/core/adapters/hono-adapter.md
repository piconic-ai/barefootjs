---
title: Hono Adapter
description: Generate Hono JSX templates from the compiler's IR for Hono-based servers.
---

# Hono Adapter

Generates Hono JSX (`.tsx`) files from the compiler's IR. Works with Hono and any JSX-compatible TypeScript backend.

```
npm install @barefootjs/hono
```


## Basic Usage

```typescript
import { compile } from '@barefootjs/jsx'
import { HonoAdapter } from '@barefootjs/hono'

const adapter = new HonoAdapter()
const result = compile(source, { adapter })

// result.template  → .tsx file content
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

Without `"use client"`, the template is generated with props access and hydration markers (for potential parent hydration), but no client JS:

**Source:**

```tsx
export function Greeting(props: { name: string }) {
  return <h1>Hello, {props.name}!</h1>
}
```

**Output (.tsx):**

```tsx
import { bfText, bfTextEnd } from '@barefootjs/hono/utils'

export function Greeting(__allProps: { name: string } & { __instanceId?: string; ... }) {
  const { __instanceId, ..., ...props } = __allProps
  const __scopeId = __instanceId || `Greeting_${...}`

  return (
    <h1 bf-s={...} bf="s1">
      Hello, {bfText("s0")}{props.name}{bfTextEnd()}!
    </h1>
  )
}
```

### Client Component

**Source:**

```tsx
"use client"
import { createSignal } from '@barefootjs/client'

export function Counter(props: { initial?: number }) {
  const [count, setCount] = createSignal(props.initial ?? 0)

  return (
    <div>
      <span>Count: {count()}</span>
      <button onClick={() => setCount(n => n + 1)}>+1</button>
    </div>
  )
}
```

**Output (.tsx):**

```tsx
import { bfText, bfTextEnd } from '@barefootjs/hono/utils'

export function Counter(__allProps: { initial?: number } & { __instanceId?: string; ... }) {
  const { __instanceId, ..., ...props } = __allProps
  const __scopeId = __instanceId || `Counter_${Math.random().toString(36).slice(2, 8)}`
  const count = () => props.initial ?? 0    // signal → server-side stub

  return (
    <div bf-s={...} {...(... ? { "bf-p": __bfPropsJson } : {})}>
      <span bf="s1">Count: {bfText("s0")}{count()}{bfTextEnd()}</span>
      <button onClick={() => {}} bf="s2">+1</button>
    </div>
  )
}
```

- `bf-s` — component scope boundary (unique per instance)
- `bf="sN"` — client JS targets (elements, text nodes)
- `bfText("s0")` / `bfTextEnd()` — text node markers (rendered as `<!--bf:s0-->...<!--/-->`)
- Signal stubs (`count = () => props.initial ?? 0`) — render initial values server-side
- `bf-p` — serialized props JSON for client hydration
- Event handlers are replaced with no-ops (client JS handles the real ones)


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

Ternaries with element branches use `bf-c` markers. Text-only ternaries use comment markers:

**Element branches:**

```tsx
{loggedIn() ? <span>Welcome back!</span> : <span>Please log in</span>}
```

```tsx
{loggedIn() ? <span bf-c="s0">Welcome back!</span> : <span bf-c="s0">Please log in</span>}
```

**Text-only branches:**

```tsx
{on() ? 'ON' : 'OFF'}
```

```tsx
{on() ? <>{bfComment("cond-start:s0")}{'ON'}{bfComment("cond-end:s0")}</>
      : <>{bfComment("cond-start:s0")}{'OFF'}{bfComment("cond-end:s0")}</>}
```

## Loop Rendering

**Source:**

```tsx
{items().map(item => <li key={item}>{item}</li>)}
```

**Output:**

```tsx
{bfComment('loop')}{items().map((item) => <li key={item}>{bfText("s0")}{item}{bfTextEnd()}</li>)}{bfComment('/loop')}
```

Loop markers (`<!--bf-loop-->...<!--bf-/loop-->`) are used for reconciliation. For child components in loops, the adapter generates unique instance IDs per iteration using the loop index or `key`.

## Deploying to Cloudflare Workers

`bf build` writes browser-served files (`barefoot.js`, `*.client.js`, vendor chunks) and server/build-only files (the SSR `.tsx` templates, `manifest.json`, `barefoot-externals.json`, `.bfemit.json`, `.buildcache.json`, `.dev/`) into the same `outDir`. With Workers Assets, `assets.directory` serves that whole directory, so a naive `wrangler deploy` would upload the server-only files too — shipping the SSR template source and build internals as publicly fetchable assets.

To prevent this, `bf build` maintains a [`.assetsignore`](https://developers.cloudflare.com/workers/static-assets/#ignoring-assets) in `outDir` whenever the project targets Workers (detected by a `wrangler.toml` / `wrangler.json` / `wrangler.jsonc` next to `barefoot.config.ts`). The server/build-only outputs are listed in a managed block that's regenerated on every build:

```
# >>> barefoot managed block (generated by `bf build`) >>>
# Server/build-only barefoot outputs — not browser-served. Regenerated on
# every `bf build`; add your own entries outside this block.
.bfemit.json
.buildcache.json
.dev/
barefoot-externals.json
components/Counter.tsx
components/manifest.json
# <<< barefoot managed block <<<
```

Anything you add outside the managed markers is preserved across rebuilds. The browser-served outputs (`barefoot.js`, `*.client.js`, vendor chunks) are intentionally left out so they still deploy.
