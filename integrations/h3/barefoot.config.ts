import { createConfig } from '@barefootjs/hono/build'

// All compiled client bundles (barefoot.js + *.client.js) and the SSR
// marked templates land under dist/; the server serves the client bundles
// from `${staticBase}` and imports the templates from dist/components.
const staticBase = '/static/components/'

export default createConfig({
  components: ['../shared/components', '../shared/blog'],
  outDir: 'dist',
  minify: true,
  scriptBasePath: staticBase,
  // Bundle the browser-side router bootstrap alongside the compiled islands
  // and barefoot.js. `bf build` handles this; no standalone build-client
  // script needed. `@barefootjs/client*` is externalized implicitly so the
  // router and the islands share one reactive runtime instance.
  bundleEntries: [{ entry: 'client/router-entry.ts', outfile: 'router-entry.js' }],
  adapterOptions: {
    clientJsBasePath: staticBase,
    barefootJsPath: `${staticBase}barefoot.js`,
  },
})
