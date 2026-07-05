import { createConfig } from '@barefootjs/jinja/build'

const basePath = process.env.BASE_PATH ?? '/integrations/django'
const clientBase = `${basePath}/client/`

// Blog (the @barefootjs/router showcase, e.g.
// integrations/xslate/barefoot.config.ts's `../shared/blog` + `client/
// router-entry.ts` bundle entry) was previously left out: the adapter
// couldn't SSR-compute PostList's/ReaderToolbar's derived searchParams()
// memos. That is fixed as of #2076, so blog is wired up here the same way.
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
