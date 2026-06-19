import { createConfig } from '@barefootjs/hono/build'

const basePath = process.env.BASE_PATH ?? '/integrations/hono'
const staticBase = `${basePath}/static/components/`

export default createConfig({
  components: ['components', '../shared/components', '../shared/blog'],
  outDir: 'dist',
  minify: true,
  scriptBasePath: staticBase,
  bundleEntries: [{ entry: 'client/router-entry.ts', outfile: 'router-entry.js' }],
  adapterOptions: {
    clientJsBasePath: staticBase,
    barefootJsPath: `${staticBase}barefoot.js`,
  },
})
