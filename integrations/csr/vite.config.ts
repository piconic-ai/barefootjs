import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/vite'
import { CSRAdapter } from '@barefootjs/client/build'

const HERE = dirname(fileURLToPath(import.meta.url))

// Every `pages/*.html` file is a genuine Vite entry (not a static passthrough
// asset): each one's inline `<script type="module">` imports a component
// `.tsx` file directly (e.g. `../../shared/components/Counter.tsx`) and
// `@barefootjs/client/runtime`'s `render()`. Both need real module
// resolution/bundling — the FIRST because `barefoot()`'s own `transform`
// hook only ever sees a `.tsx` file if something reaches it as a module (an
// unprocessed static HTML file never would), the SECOND because a plain
// static file server (`server.ts`) can't resolve a bare `@barefootjs/
// client/runtime` specifier a browser would otherwise need an import map
// for. Routing pages through Vite's own multi-page build lets it rewrite
// both into real, hashed asset URLs — no hand-written import map, no
// hardcoded `/static/components/Foo.client.js` guess at what the legacy
// CLI's un-bundled output layout used to be.
const pages = [
  'index',
  'counter',
  'toggle',
  'todos',
  'form',
  'portal',
  'reactive-props',
  'props-reactivity',
  'conditional-return',
  'conditional-return-link',
]

// `package.json`'s `build:watch` runs `vite build --watch` here, NOT
// `vite dev` (the convention every other migrated integration uses). Those
// integrations pair `vite dev` with a BACKEND dev script that reads
// `templates` at request time and renders a `<script src>` pointing at
// Vite's own dev-server origin (see `@barefootjs/vite`'s `devScriptAssets`)
// — a cross-origin split that needs a template-rendering step in the
// middle. CSR has no such step: its pages are the shell, served verbatim by
// `server.ts` from `dist/pages/`, so there is nothing to bake a dev-origin
// URL INTO. `vite build --watch` keeps CSR's actual dev loop (rebuild to
// `dist/` on save, then reload the browser) working exactly as it did under
// the legacy CLI's own `--watch`, without a half-working dev-server split
// that would silently never take effect.

export default defineConfig({
  base: '/static/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Several pages' inline module scripts use top-level `await import(...)`
    // (fetching data before rendering, e.g. `todos.html`) — Vite/esbuild's
    // default target predates top-level await support.
    target: 'esnext',
    rollupOptions: {
      // Merged with `barefoot()`'s own component-derived entries — see
      // `@barefootjs/hono/vite`'s `router-entry` for the same
      // user-config-supplies-extra-entries pattern.
      input: Object.fromEntries(pages.map(name => [`pages/${name}`, resolve(HERE, `pages/${name}.html`)])),
    },
  },
  plugins: [
    barefoot({
      // CSRAdapter's `generate()` always returns empty output — CSR has no
      // template-language backend, no SSR shell, nothing for a `templates`
      // dir to hold. `templates` stays unset; `@barefootjs/vite` verifies
      // that claim itself rather than trusting it (see its
      // `assertNoRealTemplateOutput`).
      adapter: new CSRAdapter(),
      components: ['../shared/components'],
    }),
  ],
})
