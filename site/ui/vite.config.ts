import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/hono/vite'

const HERE = dirname(fileURLToPath(import.meta.url))
// The catalog page's `@barefootjs/router` bootstrap (client/router-entry.ts)
// is a hand-written script, not a `.tsx` component, so `barefoot()`'s own
// discovery never sees it: `rollupOptions.input` below requests the bundling,
// and `assets.RouterEntry` resolves the content-hashed URL `catalog.tsx`
// reads from `dist/bf-assets.ts`.
const routerEntry = resolve(HERE, 'client/router-entry.ts')

// `dist/` is simultaneously the Workers asset root ([assets] in
// wrangler.toml) AND a source directory the Worker bundle imports from
// (`@/*` and `@ui/*` map to ./dist/*), so `build.outDir` must stay scoped
// to `dist/static/components` — pointing it at `dist` would let
// `emptyOutDir` delete the compiled templates, the registry (dist/r),
// llms.txt and _headers. `build.ts` runs this build first, then assembles
// everything else under dist/.
export default defineConfig({
  base: '/static/components/',
  publicDir: false,
  build: {
    outDir: 'dist/static/components',
    emptyOutDir: true,
    rollupOptions: {
      input: { 'router-entry': routerEntry },
    },
  },
  plugins: barefoot({
    components: [
      // The component library gets layer-components: prefixed classes so
      // its base classes land in a lower CSS cascade layer than app
      // overrides (see site/ui/styles/globals.css's @layer order).
      { dir: '../../ui/components', cssLayerPrefix: 'components', skipDirs: ['shared'] },
      // Docs/demo components. `shared/` holds non-component utility
      // modules (and PlaygroundLayout, deliberately uncompiled — same as
      // the legacy build) that build.ts copies through verbatim.
      { dir: 'components', skipDirs: ['shared'] },
      '../shared/components',
    ],
    templates: 'dist/components',
    assets: { RouterEntry: routerEntry },
  }),
})
