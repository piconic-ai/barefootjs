import { createConfig } from '@barefootjs/xslate/build'

const basePath = process.env.BASE_PATH ?? '/integrations/xslate'
const clientBase = `${basePath}/client/`

export default createConfig({
  components: ['../shared/components', '../shared/blog'],
  outDir: 'dist',
  minify: true,
  adapterOptions: {
    clientJsBasePath: clientBase,
    barefootJsPath: `${clientBase}barefoot.js`,
  },
})
