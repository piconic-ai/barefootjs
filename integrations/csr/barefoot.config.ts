import { createConfig } from '@barefootjs/client/build'

export default createConfig({
  components: ['../shared/components'],
  outDir: 'dist',
  minify: true,
})
