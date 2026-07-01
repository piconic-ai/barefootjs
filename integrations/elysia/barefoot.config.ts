import { queryHrefPlugin } from '@barefootjs/router/plugins'
import { createConfig } from '@barefootjs/hono/build'

// Compiled client bundles (barefoot.js + *.client.js) and the SSR marked
// templates land under dist/; the server serves the client bundles from
// `${staticBase}` and imports the templates from dist/components.
const staticBase = '/static/components/'

export default createConfig({
  plugins: [queryHrefPlugin],
  components: ['../shared/components', '../shared/blog'],
  outDir: 'dist',
  minify: true,
  scriptBasePath: staticBase,
  bundleEntries: [{ entry: 'client/router-entry.ts', outfile: 'router-entry.js' }],
  adapterOptions: {
    clientJsBasePath: staticBase,
    barefootJsPath: `${staticBase}barefoot.js`,
  },
})