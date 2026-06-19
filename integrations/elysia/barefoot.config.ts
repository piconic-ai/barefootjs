import { createConfig } from '@barefootjs/hono/build'

// Compiled client bundles (barefoot.js + *.client.js) and the SSR marked
// templates land under dist/; the server serves the client bundles from
// `${staticBase}` and imports the templates from dist/components.
const staticBase = '/static/components/'

export default createConfig({
  components: ['../shared/components', '../shared/blog'],
  outDir: 'dist',
  minify: true,
  scriptBasePath: staticBase,
  // Bundle the browser-side router bootstrap alongside the compiled islands
  // and barefoot.js. `@barefootjs/client*` stays external so it resolves
  // through the page's import map to the same runtime the islands use — one
  // reactive instance, so the router's `searchParams()` push reaches their
  // effects. `bf build` handles this; no standalone build-client script.
  bundleEntries: [
    {
      entry: 'client/router-entry.ts',
      outfile: 'router-entry.js',
      externals: [
        '@barefootjs/client',
        '@barefootjs/client/runtime',
        '@barefootjs/client/reactive',
      ],
    },
  ],
  adapterOptions: {
    clientJsBasePath: staticBase,
    barefootJsPath: `${staticBase}barefoot.js`,
  },
})
