import { queryHrefPlugin } from '@barefootjs/router/plugins'
import { createConfig } from '@barefootjs/go-template/build'

const basePath = process.env.BASE_PATH ?? '/integrations/echo'
const staticBase = `${basePath}/static/client/`

export default createConfig({
  plugins: [queryHrefPlugin],
  components: ['../shared/components', '../shared/blog'],
  outDir: 'dist',
  minify: true,
  bundleEntries: [{ entry: 'client/router-entry.ts', outfile: 'router-entry.js' }],
  adapterOptions: {
    packageName: 'main',
    clientJsBasePath: staticBase,
    barefootJsPath: `${staticBase}barefoot.js`,
  },
  typesOutputFile: 'components.go',
})