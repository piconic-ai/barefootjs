import { createConfig } from '@barefootjs/rust/build'

const basePath = process.env.BASE_PATH ?? '/integrations/axum'
const clientBase = `${basePath}/client/`

// Blog (the @barefootjs/router showcase) mirrors integrations/flask's
// barefoot.config.ts: the minijinja adapter can SSR-compute PostList's/
// ReaderToolbar's derived searchParams() memos (#2076), so blog is wired up
// the same way as every other post-#2076 adapter.
export default createConfig({
  components: ['../shared/components', '../shared/blog'],
  outDir: 'dist',
  minify: true,
  bundleEntries: [{ entry: 'client/router-entry.ts', outfile: 'router-entry.js' }],
  adapterOptions: {
    clientJsBasePath: clientBase,
    barefootJsPath: `${clientBase}barefoot.js`,
  },
})
