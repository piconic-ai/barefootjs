import { createConfig } from '@barefootjs/erb/build'

const basePath = process.env.BASE_PATH ?? '/integrations/rails'
const clientBase = `${basePath}/client/`

export default createConfig({
  components: ['../shared/components', '../shared/blog'],
  outDir: 'dist',
  minify: true,
  bundleEntries: [{ entry: 'client/router-entry.ts', outfile: 'router-entry.js' }],
  adapterOptions: {
    clientJsBasePath: clientBase,
    barefootJsPath: `${clientBase}barefoot.js`,
  },
})
