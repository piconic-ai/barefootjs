import { createConfig } from '@barefootjs/mojolicious/build'

const basePath = process.env.BASE_PATH ?? '/integrations/mojolicious'
const clientBase = `${basePath}/client/`

export default createConfig({
  components: ['../shared/components', '../shared/blog'],
  outDir: 'dist',
  minify: true,
  // Bundle the browser-side router bootstrap alongside the compiled islands
  // and barefoot.js. `bf build` handles this; no standalone build-client
  // script needed. `@barefootjs/client*` is externalized implicitly so the
  // router and the islands share one reactive runtime instance.
  bundleEntries: [{ entry: 'client/router-entry.ts', outfile: 'router-entry.js' }],
  adapterOptions: {
    clientJsBasePath: clientBase,
    barefootJsPath: `${clientBase}barefoot.js`,
  },
})
