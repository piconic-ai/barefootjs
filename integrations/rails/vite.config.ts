import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/erb/vite'

const HERE = dirname(fileURLToPath(import.meta.url))
const basePath = process.env.BASE_PATH ?? '/integrations/rails'
const routerEntry = resolve(HERE, 'client/router-entry.ts')

// This app's own Rollup entry: `client/router-entry.ts` (the
// `@barefootjs/router` bootstrap for the blog) is a hand-written script,
// not a `.tsx` component, so `barefoot()`'s own discovery never sees it —
// per the design, bundling configuration is stock Vite config this plugin
// never adds on the app's behalf. `assets.RouterEntry` below (ERB-
// specific) only resolves the URL Vite bundles this to; THIS is what
// requests the bundling.
export default defineConfig({
  base: `${basePath}/client/`,
  build: {
    // Scoped to `dist/client` (not the whole `dist`), matching the existing
    // `config.ru` Rack::Files mount (`${BASE}/client` -> `dist/client`) —
    // the templates dir below is a SEPARATE, non-web-exposed directory
    // Ruby reads locally, never served over HTTP.
    outDir: 'dist/client',
    emptyOutDir: true,
    rollupOptions: {
      input: { 'router-entry': routerEntry },
    },
  },
  plugins: barefoot({
    components: ['../shared/components', '../shared/blog'],
    // Matches the legacy CLI's output layout exactly (`outputLayout:
    // { templates: 'templates', clientJs: 'client', runtime: 'client' }`
    // under `outDir: 'dist'`) — `BACKEND` (BarefootJS::Backend::Erb) reads
    // `dist/templates` directly; it is never served over HTTP.
    templates: 'dist/templates',
    // ExampleApp.blog_page no longer hand-writes `.../client/router-
    // entry.js` (it's content-hashed under Vite) or a `barefoot.js`
    // importmap entry (the runtime is a shared ESM chunk the browser
    // follows on its own — see example_app.rb's blog_page comment).
    // `dist/bf-assets.json`'s `["RouterEntry"]` is what
    // `ExampleApp::ASSETS` reads instead.
    assets: { RouterEntry: routerEntry },
  }),
})
