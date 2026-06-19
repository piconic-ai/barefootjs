import { createConfig } from '@barefootjs/hono/build'

const basePath = process.env.BASE_PATH ?? '/integrations/hono'
const staticBase = `${basePath}/static/components/`

export default createConfig({
  components: ['components', '../shared/components', '../shared/blog'],
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
