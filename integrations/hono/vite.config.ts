import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/hono/vite'

const HERE = dirname(fileURLToPath(import.meta.url))
const basePath = process.env.BASE_PATH ?? '/integrations/hono'
const routerEntry = resolve(HERE, 'client/router-entry.ts')

// This app's own Rollup entry: `client/router-entry.ts` (the
// `@barefootjs/router` bootstrap for the blog) is a hand-written script,
// not a `.tsx` component, so `barefoot()`'s own discovery never sees it —
// per the design, bundling configuration is stock Vite config this plugin
// never adds on the app's behalf. `assets.RouterEntry` below only resolves
// the URL Vite bundles this to; THIS is what requests the bundling.
export default defineConfig({
  base: `${basePath}/static/components/`,
  build: {
    outDir: 'dist/static/components',
    emptyOutDir: true,
    rollupOptions: {
      input: { 'router-entry': routerEntry },
    },
  },
  plugins: barefoot({
    components: ['components', '../shared/components', '../shared/blog'],
    // `dist/components` matches the legacy CLI's output layout, which
    // `tsconfig.json`'s `@/components/*` path already points at —
    // `server.tsx` / `blog.tsx` import compiled components from there
    // unchanged by this migration.
    templates: 'dist/components',
    // `renderer.tsx` / `blog.tsx` no longer hand-write
    // `.../static/components/barefoot.js` (the runtime is a shared ESM
    // chunk every bundled entry imports, followed by the browser on its
    // own) or `.../static/components/router-entry.js` (content-hashed
    // under Vite). `dist/bf-assets.ts`'s `Assets.RouterEntry` is what
    // `blog.tsx` reads instead.
    assets: { RouterEntry: routerEntry },
  }),
})
