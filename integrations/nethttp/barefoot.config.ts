import { createConfig } from '@barefootjs/go-template/build'

const basePath = process.env.BASE_PATH ?? '/integrations/nethttp'
const staticBase = `${basePath}/static/client/`

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
    packageName: 'main',
    clientJsBasePath: staticBase,
    barefootJsPath: `${staticBase}barefoot.js`,
  },
  typesOutputFile: 'components.go',
})
