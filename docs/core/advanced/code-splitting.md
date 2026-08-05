---
title: Vendor code-splitting
description: Split large vendor libraries into separately-cached browser chunks via Vite's own `manualChunks`
---

# Vendor code-splitting

Apps that embed large libraries (xyflow, yjs, etc.) alongside BarefootJS components can reach 700–800 KB of client JS on first visit. Splitting those libraries out as separate browser chunks dramatically cuts repeat-visit transfer.

BarefootJS has no config of its own for this — vendor code-splitting is Vite's job. Use stock Vite/Rollup config alongside the `barefoot()` plugin:

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

The Hono adapter's `<BfImportMap />` component (`@barefootjs/hono/app`) emits the built-in `@barefootjs/client*` browser-specifier mappings. Its optional `manifest` prop takes `{ importmap, preloads }` — pass it only if you construct that shape yourself from your own Vite build output. Most apps don't need to: Vite resolves and bundles everything ahead of time, so there is no browser-side importmap to maintain.
