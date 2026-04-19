import { createConfig } from '@barefootjs/mojolicious/build'

const basePath = process.env.BASE_PATH ?? '/integrations/mojolicious'
const clientBase = `${basePath}/client/`

export default createConfig({
  components: ['../shared/components'],
  outDir: 'dist',
  minify: true,
  adapterOptions: {
    clientJsBasePath: clientBase,
    barefootJsPath: `${clientBase}barefoot.js`,
  },
})
