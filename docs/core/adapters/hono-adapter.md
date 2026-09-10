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
import { BfScripts } from '@barefootjs/hono/scripts'

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

`@barefootjs/hono/vite`'s `barefoot()` plugin takes separate `templates` and `build.outDir` options — the compiled SSR `.tsx` templates land under `templates` (a server-side source directory your app imports from), while Vite's own client build (`barefoot.js`, `*.client.js`, vendor chunks) lands under stock `build.outDir`. Point Workers Assets' `assets.directory` at `build.outDir` only; the SSR template directory never needs to be — and should not be — publicly served. No `.assetsignore` bookkeeping is required: the two output trees are separate directories by construction, e.g.:

```ts
// vite.config.ts
export default defineConfig({
  build: { outDir: 'dist/static/components' }, // → assets.directory
  plugins: barefoot({
    components: ['components'],
    templates: 'dist/components',              // server-only, not deployed as an asset
  }),
})
```

## Adding to an Existing Project

`npm create barefootjs@latest` scaffolds the layout above from scratch; this section retrofits it onto an existing Hono + Cloudflare Workers app that already renders with `hono/jsx-renderer` and deploys with `wrangler deploy`. The end state is the same as the scaffold's, so a freshly scaffolded project is a valid reference to diff against when something doesn't line up.

### What changes

`barefoot()` compiles **individual components** — each `.tsx` under `components` becomes an SSR template under `templates` plus hydration JS under `build.outDir`. It never bundles the server app into a single file. For a project that currently does that with a whole-app Vite bundler (e.g. `@hono/vite-build`), the consequence is:

| | Before | After |
|---|---|---|
| Server build | Bundler plugin emits a single-file SSR bundle | Step removed; nothing replaces it |
| `wrangler.jsonc` `main` | The pre-bundled output | The uncompiled entry file — wrangler's own esbuild bundles it at dev/deploy time |
| `vite build` | Produces the server bundle | Produces compiled templates + hydration JS only |

`barefoot()` takes the bundler plugin's place in `vite.config.ts`, and any `package.json` script or CI step that referenced the old bundle path goes with it.

**Paths in this section are the scaffold's** (`components/`, `dist/components`, `public/components`, `server.tsx`, `renderer.tsx`). Substitute your own. Two that are easy to copy literally by mistake:

- `wrangler.jsonc` `main` must be your app's actual Hono entry file (e.g. `src/index.tsx`). Copying `server.tsx` as-is fails immediately with `The entry-point file at "server.tsx" was not found`.
- `import { renderer } from './renderer'` assumes `jsxRenderer` lives in its own module, as in the scaffold. If yours is defined inline in the entry file, edit it there and skip the import — there's no need to split it out.

### 1. Install

```sh
npm install @barefootjs/client @barefootjs/hono @barefootjs/jsx @barefootjs/shared
npm install -D @barefootjs/vite
```

> **Peer dependencies.** `@barefootjs/hono` peer-depends on `vite ^6.0.0` and `@barefootjs/jsx` on `typescript ^5.0.0`. A project already on a newer major of either (e.g. `vite@8`, `typescript@7`) fails `npm install` with an `ERESOLVE` error. Either install with `--legacy-peer-deps` or pin `typescript` to `^5`. The `typescript` range is the one that matters: a newer `vite` alone works in practice, but a newer `typescript` makes `vite build` crash at config-load time with `TypeError: ts.createPrinter is not a function` — an opaque runtime error, not a version check — because `@barefootjs/vite` calls the `typescript` package's compiler API directly.

### 2. Config files

#### `tsconfig.json`

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@barefootjs/hono/jsx",
    "baseUrl": ".",
    "paths": {
      "@/components/*": ["./dist/components/*", "./components/*"]
    }
  },
  "exclude": ["node_modules", "dist/components"]
}
```

`@/components/*` has two targets, tried in order by both TypeScript and wrangler: the compiled SSR template under `dist/components/` (carrying the hydration markers from Output Format above) whenever it exists, otherwise the raw source under `components/` so editor tooling and type-checking resolve before the first build. Excluding `dist/components` keeps the compiled copy out of type-checking. Everything else already in `compilerOptions` (`types`, `strict`, …) stays as it is.

#### `vite.config.ts`

```ts
// vite.config.ts
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/hono/vite'

const HERE = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // Public URL prefix of the client build. Must match the path Workers
  // Assets serves `build.outDir` under (wrangler.jsonc below).
  base: '/components/',
  resolve: {
    // Required, not optional: Vite's dev-server dependency pre-scan runs
    // before this plugin's `transform` hook and ignores tsconfig `paths`.
    // Points at the SOURCE tree, never at `dist/components`.
    alias: {
      '@/components': resolve(HERE, 'components'),
    },
  },
  // `build.outDir` sits inside `public/`, which Workers Assets already
  // serves as-is. Vite's default `publicDir` would copy the rest of
  // `public/` into `public/components` on every build for nothing.
  publicDir: false,
  build: {
    outDir: 'public/components',   // hydration JS → served by Workers Assets
    emptyOutDir: true,
  },
  plugins: barefoot({
    components: ['components'],    // .tsx source directories to compile
    templates: 'dist/components',  // compiled SSR templates → imported by the server, never served
  }),
})
```

Everything not shown (hashing, chunking, minification, dev server) is stock Vite. `adapterOptions`, `assets`, and `assetsOutputFile` (see Options above) are not needed for a retrofit.

#### `wrangler.jsonc`

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "my-app",
  // Your existing uncompiled Hono entry (see "Paths" above). Wrangler
  // bundles it and follows the tsconfig `paths` mapping into dist/components/.
  "main": "server.tsx",
  "compatibility_date": "2025-01-01",
  // Must cover `build.outDir` from vite.config.ts and must not include
  // `templates` — see Deploying to Cloudflare Workers above.
  "assets": {
    "directory": "./public"
  }
}
```

### 3. Wire the app

**Render `<BfScripts />` once** (from `@barefootjs/hono/scripts`) in the layout your `jsxRenderer` already defines — not inside individual components. It emits the `<script>` tags loading each compiled component's hydration JS exactly once per page, however many instances are rendered (see Script Collection above). Existing `ContextRenderer` augmentation and stylesheet links stay as they are.

```tsx
import { jsxRenderer } from 'hono/jsx-renderer'
import { BfScripts } from '@barefootjs/hono/scripts'

export const renderer = jsxRenderer(({ children, title }) => (
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>{title ?? 'My app'}</title>
    </head>
    <body>
      {children}
      <BfScripts />
    </body>
  </html>
))
```

**Import components through the alias**, not a relative path into the source tree, so the dist-first resolution from `tsconfig.json` applies:

```tsx
// server.tsx
import { Hono } from 'hono'
import { renderer } from './renderer'
import { Counter } from '@/components/Counter'

const app = new Hono()
app.use('*', renderer)
app.get('/', (c) => c.render(<main><Counter /></main>, { title: 'My app' }))
export default app
```

Existing plain Hono JSX components can stay put and move under `components/` one at a time — only files under a configured `components` directory are compiled.

### 4. Build and verify

```sh
npx vite build      # writes dist/components/ (templates) and public/components/ (hydration JS)
npx wrangler dev    # or: npx wrangler deploy
```

Load a page that renders a converted `"use client"` component: its element carries a `bf` marker attribute (see Output Format above) and it responds to interaction. During development, run `vite dev` alongside `wrangler dev` so `dist/components/` keeps regenerating on change.
