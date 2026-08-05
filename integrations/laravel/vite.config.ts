import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/blade/vite'

const HERE = dirname(fileURLToPath(import.meta.url))
const basePath = process.env.BASE_PATH ?? '/integrations/laravel'
const routerEntry = resolve(HERE, 'client/router-entry.ts')

// This app's own Rollup entry: `client/router-entry.ts` (the
// `@barefootjs/router` bootstrap for the blog) is a hand-written script,
// not a `.tsx` component, so `barefoot()`'s own discovery never sees it —
// per the design, bundling configuration is stock Vite config this plugin
// never adds on the app's behalf. `assets.RouterEntry` below (Blade-
// specific) only resolves the URL Vite bundles this to; THIS is what
// requests the bundling.
export default defineConfig({
  base: `${basePath}/client/`,
  build: {
    // Scoped to `dist/client` (not the whole `dist`), matching the existing
    // `routes/web.php` static route (`client/{path}` -> `dist/client`) — the
    // templates dir below is a SEPARATE, non-web-exposed directory PHP reads
    // locally, never served over HTTP.
    outDir: 'dist/client',
    emptyOutDir: true,
    rollupOptions: {
      input: { 'router-entry': routerEntry },
    },
  },
  plugins: barefoot({
    components: ['../shared/components', '../shared/blog'],
    // `ExampleApp::backend()`'s `BladeBackend` reads `dist/templates`
    // directly; it is never served over HTTP.
    templates: 'dist/templates',
    // The runtime is a shared ESM chunk the browser follows on its own —
    // see ExampleApp.php's header comment. `dist/bf-assets.json`'s
    // `["RouterEntry"]` is what `ExampleApp::assets()` reads to resolve
    // this script's URL.
    assets: { RouterEntry: routerEntry },
  }),
})
