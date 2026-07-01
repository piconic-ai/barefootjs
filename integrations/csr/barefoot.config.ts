import { queryHrefPlugin } from '@barefootjs/router/plugins'
import { createConfig } from '@barefootjs/client/build'

export default createConfig({
  plugins: [queryHrefPlugin],
  components: ['../shared/components'],
  outDir: 'dist',
  minify: true,
})