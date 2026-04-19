import { createConfig } from '@barefootjs/hono/build'

const basePath = process.env.BASE_PATH ?? '/integrations/hono'
const staticBase = `${basePath}/static/components/`

export default createConfig({
  components: ['components', '../shared/components'],
  outDir: 'dist',
  minify: true,
  scriptBasePath: staticBase,
  adapterOptions: {
    clientJsBasePath: staticBase,
    barefootJsPath: `${staticBase}barefoot.js`,
  },
})
