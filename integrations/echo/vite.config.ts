import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/go-template/vite'

const HERE = dirname(fileURLToPath(import.meta.url))
const basePath = process.env.BASE_PATH ?? '/integrations/echo'
const routerEntry = resolve(HERE, 'client/router-entry.ts')

// This app's own Rollup entry: `client/router-entry.ts` (the
// `@barefootjs/router` bootstrap for the blog) is a hand-written script,
// not a `.tsx` component, so `barefoot()`'s own discovery never sees it —
// per the design, bundling configuration is stock Vite config this plugin
// never adds on the app's behalf. `assets.RouterEntry` below (Go-specific)
// only resolves the URL Vite bundles this to; THIS is what requests the
// bundling.
export default defineConfig({
  base: `${basePath}/static/`,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: { 'router-entry': routerEntry },
    },
  },
  plugins: barefoot({
    components: ['../shared/components', '../shared/blog'],
    // `main.go`'s `loadTemplates` (`ParseGlob("dist/templates/*.tmpl")`)
    // and `e.Static(basePath+"/static", "dist")` already serve everything
    // under `dist/` (including `dist/templates`).
    templates: 'dist/templates',
    packageName: 'main',
    typesOutputFile: 'components.go',
    // The runtime is a shared ESM chunk the browser follows on its own —
    // see blog.go's header comment. `bf_assets.go`'s
    // `Assets["RouterEntry"]` is what `blog.go` reads to resolve this
    // script's URL.
    assets: { RouterEntry: routerEntry },
    assetsOutputFile: 'bf_assets.go',
  }),
})
