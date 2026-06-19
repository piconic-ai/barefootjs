import { createConfig } from '@barefootjs/mojolicious/build'

const basePath = process.env.BASE_PATH ?? '/integrations/mojolicious'
const clientBase = `${basePath}/client/`

export default createConfig({
  components: ['../shared/components', '../shared/blog'],
  outDir: 'dist',
  minify: true,
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
    clientJsBasePath: clientBase,
    barefootJsPath: `${clientBase}barefoot.js`,
  },
})
