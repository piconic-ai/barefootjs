---
title: Quick Start
description: Scaffold a BarefootJS app, run the dev server, and tour the generated layout
---

# Quick Start

This page walks through scaffolding a runnable BarefootJS app, starting the dev server, and editing the starter Counter. It assumes Node 22+ and one of npm / bun / pnpm / yarn.

## 1. Scaffold

<!-- tabs:pm -->
<!-- tab:npm -->
```sh
npm create barefootjs@latest
```

<!-- tab:bun -->
```sh
bun create barefootjs
```

<!-- tab:pnpm -->
```sh
pnpm create barefootjs
```

<!-- tab:yarn -->
```sh
yarn create barefootjs
```

<!-- /tabs -->

You'll be prompted for three things:

1. **Target directory** (default: `my-app`)
2. **Adapter** (default: **Hono** on Cloudflare Workers)
3. **CSS library** (default: **UnoCSS**)

Pass `--yes` to accept every default — including `my-app` for the directory — without prompting.

## 2. Install and run

```sh
cd my-app   # the name you entered at the prompt (default: my-app)
npm install
npm run dev
```

`npm run dev` runs three watchers in parallel:

- `bf build --watch` — recompiles JSX → marked template + client JS
- `unocss --watch` — regenerates `public/uno.css` from class usage
- `wrangler dev --live-reload` — serves the Hono worker on `http://localhost:8787`

Open the URL the dev server prints. You'll see a Counter with **+1**, **-1**, and **Reset** buttons — all server-rendered first, then hydrated.

## 3. Generated layout

```
my-app/
├── barefoot.config.ts     # paths, build options, adapter
├── server.tsx             # entry: Hono app
├── renderer.tsx           # HTML shell + asset wiring
├── components/
│   ├── Counter.tsx        # the starter component ("use client")
│   └── ui/
│       ├── button/        # added by `bf add button` at scaffold time
│       └── slot/
├── meta/index.json        # local component registry index
├── public/                # build output (committed: no, gitignored)
├── uno.config.ts          # UnoCSS preset + scan globs
├── wrangler.jsonc         # Cloudflare Workers config
└── tsconfig.json
```

The single source of truth for project layout is `barefoot.config.ts`:

```ts
import { createConfig } from '@barefootjs/hono/build'

export default createConfig({
  paths: {
    components: 'components/ui',  // where `bf add` lands registry items
    tokens: 'tokens',
    meta: 'meta',
  },
  components: ['components'],     // source dirs to compile
  outDir: 'public',
})
```

## 4. Edit the Counter

`components/Counter.tsx` is a `"use client"` component using signals:

```tsx
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
import { Button } from '@/components/ui/button'

export function Counter({ initial = 0 }: { initial?: number }) {
  const [count, setCount] = createSignal(initial)
  const doubled = createMemo(() => count() * 2)

  return (
    <div className="counter">
      <p>count: {count()}</p>
      <p>doubled: {doubled()}</p>
      <Button onClick={() => setCount(n => n + 1)}>+1</Button>
    </div>
  )
}
```

Save the file — `bf build --watch` recompiles and `wrangler dev` live-reloads.

## 5. Next steps

- `bf docs <component>` — show props, variants, examples for a registry component (`bf add` writes `meta/<name>.json` automatically, so this works straight after).
- `bf debug graph <component>` — show the signal dependency graph before editing a `"use client"` component.
- `bf add <name>` — add another shadcn/ui-style component from `https://ui.barefootjs.dev/`.
- `bf search <query>` — find components and docs across the registry.

Read on:

- [Core Concepts](./core-concepts.md) — the four design principles
- [Reactivity](./reactivity.md) — `createSignal`, `createEffect`, `createMemo`
- [Components](./components.md) — authoring, props, context, slots
- [Adapters](./adapters.md) — Hono, Go template, writing your own
