import { createConfig } from '@barefootjs/blade/build'

const basePath = process.env.BASE_PATH ?? '/integrations/laravel'
const clientBase = `${basePath}/client/`

// Same compile setup as integrations/blade (the plain-PHP sibling on the same
// @barefootjs/blade adapter) -- only the mount point differs. Blog (the
// @barefootjs/router showcase) is wired up the same way; see #2076 for the
// searchParams() SSR support that made it possible for the Jinja/Twig
// adapters.
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
