import { createConfig } from '@barefootjs/client/build'

export default createConfig({
  components: ['components'],
  outDir: 'dist',
  minify: true,
})
