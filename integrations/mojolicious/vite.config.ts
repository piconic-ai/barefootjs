import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/mojolicious/vite'

const HERE = dirname(fileURLToPath(import.meta.url))
const basePath = process.env.BASE_PATH ?? '/integrations/mojolicious'
const routerEntry = resolve(HERE, 'client/router-entry.ts')

// This app's own Rollup entry: `client/router-entry.ts` (the
// `@barefootjs/router` bootstrap for the blog) is a hand-written script,
// not a `.tsx` component, so `barefoot()`'s own discovery never sees it —
// per the design, bundling configuration is stock Vite config this plugin
// never adds on the app's behalf. `assets.RouterEntry` below (Mojolicious-
// specific) only resolves the URL Vite bundles this to; THIS is what
// requests the bundling.
export default defineConfig({
  base: `${basePath}/client/`,
  build: {
    // Scoped to `dist/client` (not the whole `dist`), matching the existing
    // static-path proxy in app.pl (`/$BASE_PATH/client/*` -> `reply->static
    // ('client/...')` against `app->static->paths->[0]` = `dist`) — the
    // templates dir below is a SEPARATE, non-web-exposed directory Perl
    // reads locally, never served over HTTP.
    outDir: 'dist/client',
    emptyOutDir: true,
    rollupOptions: {
      input: { 'router-entry': routerEntry },
    },
  },
  plugins: barefoot({
    components: ['../shared/components', '../shared/blog'],
    // app.pl reads `dist/templates` directly; it is never served over
    // HTTP.
    templates: 'dist/templates',
    // The runtime is a shared ESM chunk the browser follows on its own —
    // see app.pl's blog section docstring. `dist/bf-assets.json`'s
    // `["RouterEntry"]` is what app.pl's `$BLOG_ASSETS` reads to resolve
    // this script's URL.
    assets: { RouterEntry: routerEntry },
  }),
})
