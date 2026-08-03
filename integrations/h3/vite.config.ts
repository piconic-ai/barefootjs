import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/hono/vite'
import { discoverComponents } from '@barefootjs/vite'

const HERE = dirname(fileURLToPath(import.meta.url))
const basePath = process.env.BASE_PATH ?? '/integrations/h3'
const routerEntry = resolve(HERE, 'client/router-entry.ts')
const componentDirs = [resolve(HERE, '../shared/components'), resolve(HERE, '../shared/blog')]

// h3 has no Hono `jsxRenderer` request context, so `HonoAdapter.generate()`'s
// per-request `registerComponentScripts` codegen (the mechanism
// `integrations/hono` relies on — see `@barefootjs/hono/vite`'s docstring)
// silently no-ops here: `useRequestContext()` throws with no
// `RequestContext.Provider` in the tree, and every codegen'd call swallows
// that and registers nothing. h3/Elysia therefore need every discovered
// `'use client'` component's own resolved URL up front (renderer.tsx /
// blog.tsx emit one `<script>` per entry unconditionally, since there's no
// per-page/per-request collector to be selective with — matching the
// pre-Vite behavior of emitting every entry in the legacy CLI's
// `manifest.json`). `assets` already resolves ONE hand-written entry's URL
// for `integrations/gin`/`integrations/hono`; here it's asked to resolve
// EVERY discovered client component's URL by feeding it the same
// `discoverComponents` scan core's own `barefoot()` plugin performs
// internally (reused via `@barefootjs/vite`'s public export, not
// re-implemented) instead of one hand-picked path.
async function componentAssets(): Promise<Record<string, string>> {
  const discovered = await discoverComponents(componentDirs, absPath => readFile(absPath, 'utf8'))
  const assets: Record<string, string> = {}
  for (const c of discovered) {
    if (!c.isClient) continue
    assets[basename(c.absPath, '.tsx')] = c.absPath
  }
  return assets
}

export default defineConfig(async () => ({
  base: `${basePath}/static/components/`,
  build: {
    outDir: 'dist/static/components',
    emptyOutDir: true,
    rollupOptions: {
      input: { 'router-entry': routerEntry },
    },
  },
  plugins: barefoot({
    components: ['../shared/components', '../shared/blog'],
    // `dist/components` matches the legacy CLI's output layout, which
    // `tsconfig.json`'s `@/components/*` alias already points at —
    // `server.tsx` / `blog.tsx` import compiled components from there
    // unchanged by this migration.
    templates: 'dist/components',
    // Every discovered client component PLUS the hand-written router
    // bootstrap — see this file's header comment.
    assets: { RouterEntry: routerEntry, ...(await componentAssets()) },
  }),
}))
