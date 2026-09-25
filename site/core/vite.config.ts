import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/hono/vite'

const HERE = dirname(fileURLToPath(import.meta.url))
// The layouts' `@barefootjs/router` bootstrap (site/shared/client/router-entry.ts)
// is a hand-written script, not a `.tsx` component, so `barefoot()`'s own
// discovery never sees it: `rollupOptions.input` below requests the bundling,
// and `assets.RouterEntry` resolves the content-hashed URL the renderers
// read from `dist/bf-assets.ts`.
const routerEntry = resolve(HERE, '../shared/client/router-entry.ts')

// `dist/` is simultaneously the Workers asset root ([assets] in
// wrangler.toml) AND a source directory the page generator imports from
// (`@/*` maps to ./dist/*, see scripts/generate-static.tsx), so
// `build.outDir` must stay scoped to `dist/static/components` — pointing
// it at `dist` would let `emptyOutDir` delete the compiled templates,
// llms.txt, and _headers. `build.ts` runs this build first, then
// assembles everything else under dist/.
export default defineConfig({
  base: '/static/components/',
  // public/static/snippets is copied by build.ts to dist/static/snippets;
  // Vite's default publicDir behavior would dump public/ into outDir too.
  publicDir: false,
  build: {
    outDir: 'dist/static/components',
    emptyOutDir: true,
    rollupOptions: {
      input: { 'router-entry': routerEntry },
    },
  },
  plugins: barefoot({
    components: ['components', '../shared/components', 'landing/components'],
    // `tsconfig.json`'s `@/*` alias points at ./dist, and the renderers
    // import compiled components from `@/components/...`.
    templates: 'dist/components',
    assets: { RouterEntry: routerEntry },
  }),
})
