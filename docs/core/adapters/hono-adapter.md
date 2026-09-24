---
title: Hono Adapter
description: Generate Hono JSX templates from the compiler's IR for Hono-based servers.
---

# Hono Adapter

Generates Hono JSX (`.tsx`) templates from the compiler's IR. Works with Hono and any JSX-compatible TypeScript backend. It is the default adapter of the scaffold:

```sh
npm create barefootjs@latest
```

To add it by hand:

```sh
npm install @barefootjs/hono
```

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/hono/vite'

export default defineConfig({
  build: { outDir: 'public/components' },
  plugins: barefoot({ components: ['components'], templates: 'dist/components' }),
})
```

## Options

`barefoot()` constructs the `HonoAdapter` itself; pass adapter options under `adapterOptions` when you need to change the paths:

```typescript
barefoot({
  components: ['components'],
  templates: 'dist/components',
  adapterOptions: {
    clientJsBasePath: '/static/components/',
    barefootJsPath: '/static/components/barefoot.js',
  },
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `clientJsBasePath` | `string` | `'/static/components/'` | Base path for client JS files |
| `barefootJsPath` | `string` | `'/static/components/barefoot.js'` | Path to the BarefootJS runtime |
| `clientJsFilename` | `string` | `'{componentName}.client.js'` | Override the client JS filename |

Under Vite these defaults are superseded by the hashed asset URLs the plugin resolves.

## Compiled output

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

```tsx
import { bfText, bfTextEnd } from '@barefootjs/hono/utils'

export function Counter(__allProps: { initial?: number } & { __instanceId?: string; ... }) {
  const { __instanceId, ..., ...props } = __allProps
  const __scopeId = __instanceId || `Counter_${Math.random().toString(36).slice(2, 8)}`
  const count = () => props.initial ?? 0    // signal → server-side stub

  return (
    <div bf-s={__scopeId} bf-p={__bfPropsJson}>
      <span bf="s1">Count: {bfText("s0")}{count()}{bfTextEnd()}</span>
      <button onClick={() => {}} bf="s2">+1</button>
    </div>
  )
}
```

`bf-s` marks the component scope, `bf="sN"` the nodes the client JS targets, and `bf-p` the serialized props. Handlers are no-ops on the server; the client JS attaches the real ones.

## Script collection

Rendering a client component registers its script in Hono's request context. Render `<BfScripts />` once, in the layout, and it emits each component's `<script>` tag once per page regardless of instance count:

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

## Deploying to Cloudflare Workers

`barefoot()` writes the SSR templates under `templates` (a server-side source directory your app imports from) and the client build under Vite's `build.outDir`. Point Workers Assets' `assets.directory` at `build.outDir` only; the template directory must not be served. The two trees are separate directories, so no `.assetsignore` is needed:

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

For an existing Hono + Cloudflare Workers app that renders with `hono/jsx-renderer`. `barefoot()` compiles individual components and never bundles the server app, so a whole-app Vite bundler plugin (e.g. `@hono/vite-build`) is removed and nothing replaces it. Paths below are the scaffold's.

**1. Install.**

```sh
npm install @barefootjs/client @barefootjs/hono @barefootjs/jsx @barefootjs/shared
npm install -D @barefootjs/vite
```

Pin `typescript` to `^5` (`@barefootjs/jsx`'s peer range): a newer major makes `vite build` crash at config-load time with `TypeError: ts.createPrinter is not a function`.

**2. Resolve components dist-first.** In `tsconfig.json`, map the alias to the compiled template when it exists and the source otherwise, and exclude the compiled copy from type-checking:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@barefootjs/hono/jsx",
    "baseUrl": ".",
    "paths": { "@/components/*": ["./dist/components/*", "./components/*"] }
  },
  "exclude": ["node_modules", "dist/components"]
}
```

Vite's dependency pre-scan ignores tsconfig `paths`, so `vite.config.ts` also needs `resolve.alias` pointing at the source tree:

```ts
resolve: { alias: { '@/components': resolve(HERE, 'components') } },
```

`adapterOptions`, `assets`, and `assetsOutputFile` are not needed for a retrofit — see [Vite Plugin](../advanced/vite-plugin.md).

**3. Wrangler.** `main` in `wrangler.jsonc` is your uncompiled Hono entry (e.g. `src/index.tsx`); wrangler's esbuild bundles it and follows the `paths` mapping into `dist/components/`. `assets.directory` covers `build.outDir`, not `templates`.

**4. Wire the app.** Render `<BfScripts />` once in the `jsxRenderer` layout and import components through the alias (`import { Counter } from '@/components/Counter'`). Existing components can move under `components/` one at a time; only files under a configured `components` directory are compiled.

**5. Build and verify.**

```sh
npx vite build      # writes dist/components/ (templates) and public/components/ (hydration JS)
npx wrangler dev    # or: npx wrangler deploy
```

A converted `"use client"` component renders with a `bf-s` attribute and responds to interaction. In development run `vite dev` alongside `wrangler dev` so `dist/components/` regenerates on change.
