import { createConfig } from '@barefootjs/hono/build'

// Static assets are served from inline string constants by the bundled Hono
// app (a Dynamic Worker has no filesystem / ASSETS binding), so the URL base
// is a plain, basePath-free `/static/components/`.
const staticBase = '/static/components/'

export default createConfig({
  components: ['src'],
  outDir: 'dist',
  minify: true,
  scriptBasePath: staticBase,
  adapterOptions: {
    clientJsBasePath: staticBase,
    barefootJsPath: `${staticBase}barefoot.js`,
  },
})
