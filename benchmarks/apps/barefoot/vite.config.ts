import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/vite'
import { CSRAdapter } from '@barefootjs/client/csr-adapter'

const HERE = dirname(fileURLToPath(import.meta.url))

// CSR benchmark app: no SSR template, no backend — `CSRAdapter.generate()`
// always returns empty output (see `@barefootjs/client/csr-adapter`'s
// docstring), so `templates` stays unset, matching `integrations/csr`'s own
// vite.config.ts. `index.html` is a genuine Vite entry (not a static
// passthrough asset): its inline `<script type="module">` imports
// `Bench.tsx` directly and `@barefootjs/client/runtime`. The barefoot
// plugin's own `config()` hook sets `build.rollupOptions.input` from its
// component discovery ALONE (see `packages/vite/src/plugin.ts`), so
// `index.html` must be listed explicitly here or Vite's own default
// html-entry-point detection never runs and `dist/index.html` is never
// emitted — same reasoning as the CSR scaffold's own vite.config.ts.
export default defineConfig({
  // Relative asset URLs, not Vite's default absolute `/assets/…`. The
  // benchmark runner's static server (`benchmarks/runner/serve.ts`) maps
  // `/<app>/…` onto `apps/<app>/dist/…`, so this app is mounted at
  // `/barefoot/` — an absolute `/assets/index-<hash>.js` resolves to
  // `apps/assets/dist/…` and 404s, leaving the page never setting
  // `data-ready` and the runner timing out after 30s. `'./'` works at any
  // mount depth, including the root-served shape `smoke.ts` uses.
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
    rollupOptions: {
      input: { index: resolve(HERE, 'index.html') },
    },
  },
  plugins: [
    barefoot({
      adapter: new CSRAdapter(),
      components: ['components'],
    }),
  ],
})
