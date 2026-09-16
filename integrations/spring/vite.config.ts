import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/pebble/vite'

const HERE = dirname(fileURLToPath(import.meta.url))
const basePath = process.env.BASE_PATH ?? '/integrations/spring'
const routerEntry = resolve(HERE, 'client/router-entry.ts')

// This app's own Rollup entry: `client/router-entry.ts` (the
// `@barefootjs/router` bootstrap for the blog) is a hand-written script, not
// a `.tsx` component, so `barefoot()`'s own discovery never sees it — per
// the design, bundling configuration is stock Vite config this plugin never
// adds on the app's behalf. `assets.RouterEntry` below only resolves the URL
// Vite bundles this to; THIS is what requests the bundling. Mirrors
// `integrations/axum/vite.config.ts` exactly (Rust/minijinja's Vite config),
// swapped onto `@barefootjs/pebble/vite`.
export default defineConfig({
  base: `${basePath}/client/`,
  build: {
    // Scoped to `dist/client` (not the whole `dist`), matching
    // `WebConfig.addResourceHandlers`'s `${basePath}/client/**` ->
    // `file:dist/client/` resource handler. `src/main/resources/templates`
    // below is a SEPARATE directory the JVM app reads directly off disk
    // (via Pebble's `FileLoader`, never a classpath loader — see
    // `BfContext`'s docstring), never served over HTTP.
    outDir: 'dist/client',
    emptyOutDir: true,
    rollupOptions: {
      input: { 'router-entry': routerEntry },
    },
  },
  plugins: barefoot({
    components: ['../shared/components', '../shared/blog'],
    templates: 'src/main/resources/templates',
    // The runtime is a shared ESM chunk the browser follows on its own
    // (see `client/router-entry.ts`'s docstring). `dist/bf-assets.json`'s
    // `["RouterEntry"]` is what `BfContext.assets` reads to resolve this
    // script's URL.
    assets: { RouterEntry: routerEntry },
  }),
})
