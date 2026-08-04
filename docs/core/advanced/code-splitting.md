---
title: Vendor code-splitting
description: Split large vendor libraries into separately-cached browser chunks — now handled by Vite's own bundler, not a BarefootJS-specific config.
---

# Vendor code-splitting

Apps that embed large libraries (xyflow, yjs, etc.) alongside BarefootJS components can reach 700–800 KB of client JS on first visit. Splitting those libraries out as separate browser chunks dramatically cuts repeat-visit transfer.

The legacy CLI (`bf build`) had its own `externals` / `bundleEntries` config on `barefoot.config.ts`, which copied vendor bundles into `outDir` and emitted a hand-rolled `barefoot-externals.json` importmap manifest. That config no longer exists — every project now builds through `@barefootjs/vite`'s `barefoot()` plugin, and `vite.config.ts` has no `externals` field. Vendor code-splitting is Vite's job, via stock Vite/Rollup config:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/vite'

export default defineConfig({
  plugins: [barefoot({ /* ... */ })],
  build: {
    rollupOptions: {
      output: {
        // Split heavy vendor libraries into their own cacheable chunk.
        manualChunks: {
          xyflow: ['@barefootjs/xyflow'],
          yjs: ['yjs'],
        },
      },
    },
  },
})
```

Vite's dev server and production build both content-hash and cache these chunks automatically — no manifest to wire up by hand, and no `--external` flags to compute for a separate bundler pass. See [Vite's own code-splitting docs](https://vite.dev/guide/build.html#chunking-strategy) for `manualChunks`, dynamic `import()`, and `build.rollupOptions.output`.

## `BfImportMap` (Hono adapter)

The Hono adapter's `<BfImportMap />` component (`@barefootjs/hono/app`) still exists and still works — it emits the built-in `@barefootjs/client*` browser-specifier mappings by default. Its optional `manifest` prop accepted the shape of the old `barefoot-externals.json` (`{ importmap, preloads }`); since nothing generates that file automatically anymore, only pass `manifest` if you construct one yourself (e.g. from your own Vite build output). Most apps on the Vite pipeline don't need to — Vite resolves and bundles everything ahead of time, so there's no browser-side importmap to maintain.
