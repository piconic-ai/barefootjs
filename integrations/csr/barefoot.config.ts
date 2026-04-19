import { createConfig } from '@barefootjs/hono/build'

export default createConfig({
  components: ['../shared/components'],
  outDir: 'dist',
  clientOnly: true,
  scriptCollection: false,
  minify: true,
})
