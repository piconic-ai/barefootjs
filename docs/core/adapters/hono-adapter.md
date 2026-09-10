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

The scaffold (`npm create barefootjs@latest`) is one way to reach the layout described above; this section is the other — retrofitting an existing Hono + Cloudflare Workers app that already renders with `hono/jsx-renderer` and deploys with `wrangler deploy`. The end state is the same as the scaffold's, so a freshly scaffolded project is a valid reference to diff against once you're done.

The one structural change worth understanding up front: `barefoot()` compiles **individual components** — each `.tsx` under `components` becomes an SSR template under `templates` plus hydration JS under `build.outDir`. It does not bundle the server app into a single file. If the existing project pre-bundles its SSR entry with a whole-app Vite bundler (e.g. `@hono/vite-build`), that step is not replaced by a BarefootJS equivalent — it goes away, and wrangler's own esbuild bundling of the server entry takes over (step 4).

### 1. Install

```sh
npm install @barefootjs/client @barefootjs/hono @barefootjs/jsx @barefootjs/shared
npm install -D @barefootjs/vite
```

### 2. `tsconfig.json` — the `@/components/*` path mapping

Components are imported by the server through a path alias with **two** targets, compiled output first:

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

Both entries name the same logical component; TypeScript (and wrangler, which honors `paths`) tries them in order and takes the first that resolves:

- `./dist/components/*` — the compiled SSR template written by `barefoot()` (`templates`), carrying the hydration markers and script collection described in Output Format and Script Collection above. Listed first so the server picks it up whenever it exists.
- `./components/*` — the raw source. Fallback so editor tooling and type-checking resolve imports before the first `vite build` / `vite dev` has produced anything.

`dist/components` is excluded from `include` so the compiled templates aren't type-checked as a second copy of the source. Keep whatever else your existing `compilerOptions` already has (`types`, `strict`, …); only `jsx`, `jsxImportSource`, `baseUrl`, `paths`, and the `exclude` entry are BarefootJS-specific.

### 3. `vite.config.ts` — the `barefoot()` plugin

Three things matter for a retrofit: `components` (where the source lives), `templates` (a build output directory the server imports from through the mapping in step 2), and stock Vite config for the client-asset output. Everything else — bundling, hashing, chunking, minification, the dev server — is unmodified Vite.

```ts
// vite.config.ts
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/hono/vite'

const HERE = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // Public URL prefix of the client build; must match the path Workers
  // Assets serves `build.outDir` under (see wrangler.jsonc in step 4).
  base: '/components/',
  resolve: {
    // Mirrors tsconfig's `@/components/*` mapping. Vite's dev-server
    // dependency pre-scan parses raw source before this plugin's own
    // `transform` hook runs and knows nothing about tsconfig `paths`,
    // so the alias is required. Point it at the SOURCE tree, not at
    // `dist/components`.
    alias: {
      '@/components': resolve(HERE, 'components'),
    },
  },
  // `build.outDir` lives inside `public/`. With Vite's default
  // `publicDir` the rest of `public/` (CSS, favicon, …) would be copied
  // into `public/components` on every build for nothing — Workers
  // Assets already serves `public/` as-is.
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

`adapterOptions` (see Options above) is available but not needed for a basic setup. The `assets` / `assetsOutputFile` options exist for exposing hand-written non-component scripts' bundled URLs and are unrelated to a retrofit.

If the project already has a `vite.config.ts` for a whole-app SSR bundler, the `barefoot()` config generally replaces that plugin's entry rather than sitting next to it, since the single-file server build is no longer produced (step 4).

### 4. `wrangler.jsonc` — point `main` at the uncompiled server entry

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "my-app",
  // The uncompiled entry, not a pre-bundled SSR output. Wrangler's own
  // esbuild-based bundler compiles it at dev/deploy time and follows
  // the tsconfig `paths` mapping into dist/components/.
  "main": "server.tsx",
  "compatibility_date": "2025-01-01",
  // Static assets (CSS, generated client JS, manifest) are served
  // directly by Workers Assets. The Worker handles everything else.
  "assets": {
    "directory": "./public"
  }
}
```

Previously `main` pointed at whatever single-file bundle the SSR build step produced. That step is what this migration removes: `barefoot()` only compiles components, so there is no bundled server artifact to point at anymore. Wrangler bundles `server.tsx` natively — resolving `@/components/*` to the compiled templates under `dist/components/` via the tsconfig mapping — so the server entry stays ordinary TypeScript source in the repository.

`assets.directory` must cover `build.outDir` from step 3 and must not include `templates` (see above).

When removing the whole-app bundler, also check for any configuration it required elsewhere (its own build script, output paths referenced by `package.json` scripts or CI) so nothing keeps expecting the old bundle to exist.

### 5. Render `<BfScripts />` once in the page shell

`BfScripts` (from `@barefootjs/hono/scripts`) emits the `<script>` tags that load each compiled component's hydration JS exactly once per page, however many instances are rendered (see Script Collection above). It belongs once in the layout your existing `jsxRenderer` already defines, not inside individual components:

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

Any existing `ContextRenderer` module augmentation and stylesheet links stay as they are.

### 6. Import components through the alias

Server routes import compiled components via `@/components/*` rather than a relative path into the source tree, so the dist-first resolution from step 2 applies:

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

Existing plain Hono JSX components can stay where they are and be moved under `components/` one at a time; only files under a `components` directory are compiled.

### 7. Smoke test

```sh
npx vite build      # writes dist/components/ (templates) and public/components/ (hydration JS)
npx wrangler dev    # or: npx wrangler deploy
```

Then load a page that renders a converted `"use client"` component and confirm it hydrates — the rendered element carries a `bf` marker attribute (see Output Format above) and the component responds to interaction. During development, run `vite dev` alongside `wrangler dev` so `dist/components/` keeps regenerating on change.
