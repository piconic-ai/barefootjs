import { createConfig } from '@barefootjs/hono/build'

const basePath = process.env.BASE_PATH ?? '/integrations/hono'
const staticBase = `${basePath}/static/components/`

export default createConfig({
  components: ['components', '../shared/components', '../shared/blog'],
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
