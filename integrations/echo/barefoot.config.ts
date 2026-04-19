import { createConfig } from '@barefootjs/go-template/build'

const basePath = process.env.BASE_PATH ?? '/integrations/echo'
const staticBase = `${basePath}/static/client/`

export default createConfig({
  components: ['../shared/components'],
  outDir: 'dist',
  minify: true,
  adapterOptions: {
    packageName: 'main',
    clientJsBasePath: staticBase,
    barefootJsPath: `${staticBase}barefoot.js`,
  },
  typesOutputFile: 'components.go',
})
