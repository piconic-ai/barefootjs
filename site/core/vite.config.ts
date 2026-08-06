import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/hono/vite'

// `dist/` is simultaneously the Workers asset root ([assets] in
// wrangler.toml) AND a source directory the Worker bundle imports from
// (`worker.ts` imports ./dist/content.json; `@/*` maps to ./dist/*), so
// `build.outDir` must stay scoped to `dist/static/components` — pointing
// it at `dist` would let `emptyOutDir` delete content.json, the compiled
// templates, llms.txt, and _headers. `build.ts` runs this build first,
// then assembles everything else under dist/.
export default defineConfig({
  base: '/static/components/',
  // public/static/snippets is copied by build.ts to dist/static/snippets;
  // Vite's default publicDir behavior would dump public/ into outDir too.
  publicDir: false,
  build: {
    outDir: 'dist/static/components',
    emptyOutDir: true,
  },
  plugins: barefoot({
    components: ['components', '../shared/components', 'landing/components'],
    // `tsconfig.json`'s `@/*` alias points at ./dist, and the renderers
    // import compiled components from `@/components/...`.
    templates: 'dist/components',
  }),
})
