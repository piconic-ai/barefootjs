import { createConfig } from '@barefootjs/blade/build'

const basePath = process.env.BASE_PATH ?? '/integrations/blade'
const clientBase = `${basePath}/client/`

// Blog (the @barefootjs/router showcase, e.g. integrations/flask's
// `../shared/blog` + `client/router-entry.ts` bundle entry) is wired up the
// same way here -- see #2076 for the searchParams() SSR support that made it
// possible for the Jinja/Twig adapters.
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
