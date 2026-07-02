import { createConfig } from '@barefootjs/jinja/build'

const basePath = process.env.BASE_PATH ?? '/integrations/flask'
const clientBase = `${basePath}/client/`

// Blog (the @barefootjs/router showcase the other integrations ship, e.g.
// integrations/xslate/barefoot.config.ts's `../shared/blog` + `client/
// router-entry.ts` bundle entry) is intentionally NOT wired up here: it
// requires the adapter to lower PostList's/ReaderToolbar's derived
// searchParams() memos, which is adapter-package work this integration must
// not touch (see the workstream-I task report for detail). With blog
// omitted there is no page that needs a client-side router bundle, so this
// config has no `bundleEntries` — every route only needs the per-component
// scripts `bf.scripts()` emits (see app.py's `layout()`).
export default createConfig({
  components: ['../shared/components'],
  outDir: 'dist',
  minify: true,
  adapterOptions: {
    clientJsBasePath: clientBase,
    barefootJsPath: `${clientBase}barefoot.js`,
  },
})
