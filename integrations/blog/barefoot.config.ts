import { createConfig } from '@barefootjs/hono/build'

// The blog is served by a plain Bun server (see server.tsx), so the bundles
// live under /static/components/ and are referenced from there.
const staticBase = '/static/components/'

export default createConfig({
  components: ['../shared/blog'],
  outDir: 'dist',
  minify: false,
  scriptBasePath: staticBase,
  adapterOptions: {
    clientJsBasePath: staticBase,
    barefootJsPath: `${staticBase}barefoot.js`,
  },
})
