import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/vite'
import { CSRAdapter } from '@barefootjs/client/csr-adapter'
import { BASE_PATH, OUT_DIR } from './constants.ts'

const HERE = dirname(fileURLToPath(import.meta.url))

// The 10 page-specific mount scripts (index has no island so it's excluded).
// barefoot() auto-discovers ../shared/components/*.tsx and turns each into an
// entry; these are hand-written non-component entries registered alongside
// that — the same pattern as integrations/hono's client/router-entry.ts.
const pageIslands = [
  'counter',
  'toggle',
  'form',
  'portal',
  'reactive-props',
  'props-reactivity',
  'conditional-return',
  'conditional-return-link',
  'todos',
  'ai-chat',
] as const

export default defineConfig({
  base: `${BASE_PATH}/static/components/`,
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
    target: 'esnext',
    rollupOptions: {
      input: Object.fromEntries(
        pageIslands.map((name) => [`pages/${name}`, resolve(HERE, `client/pages/${name}.ts`)]),
      ),
    },
  },
  plugins: [
    barefoot({
      // CSRAdapter's generate() always returns empty output, so `templates` is left
      // unset (same as integrations/csr — CSR has no SSR template output). With
      // `templates` unset, `afterEmit` never fires either (gated on `templatesDir`
      // in packages/vite/src/plugin.ts), so page generation via toSSG is instead
      // called explicitly by build.ts/build-watch.ts after vite build finishes.
      adapter: new CSRAdapter(),
      components: ['../shared/components'],
    }),
  ],
})
