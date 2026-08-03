---
"@barefootjs/erb": minor
---

Add `@barefootjs/erb/vite`, a composed Vite plugin for Ruby/ERB

A new subpath exporting `barefoot` (named AND default, matching core's own
`packages/vite/src/index.ts` shape, and `@barefootjs/go-template/vite`'s /
`@barefootjs/hono/vite`'s / `@barefootjs/blade/vite`'s / `@barefootjs/jinja/
vite`'s naming, exactly):

```ts
import { barefoot } from '@barefootjs/erb/vite'

export default defineConfig({
  base: '/integrations/rails/client/',
  build: { outDir: 'dist/client' },
  plugins: barefoot({
    components: ['../shared/components', '../shared/blog'],
    templates: 'dist/templates',
  }),
})
```

No `adapter` option — this constructs `ErbAdapter` itself. Byte-for-byte
the same shape as `@barefootjs/blade/vite`/`@barefootjs/jinja/vite` (see
those changesets for the full design writeup): no `afterEmit`-driven type
combination (`ErbAdapter.generate()` never produces a `types` section —
`./build.ts`'s `createConfig` has no default `postBuild` either), no
`adapterOptions` (`ErbAdapterOptions`'s two fields are dead once
`scriptAssets` is always resolved), and `assets` ports over unchanged
except the generated file is plain JSON (`dist/bf-assets.json`, gitignored,
regenerated every build) — Ruby reads it at request time, nothing to
commit.

Also carries the same fixes the port needed to actually build, since
`@barefootjs/erb/src/adapter/expr/emitters.ts` has the identical
TS-constructor-parameter-property shape (plus one extra parameter,
`renderParamAs`, whose default value reads an EARLIER parameter —
preserved verbatim across the rewrite):

- `ErbFilterEmitter`/`ErbTopLevelEmitter`'s constructors rewritten as plain
  field declarations + explicit assignment.
- The Rails/Sinatra manifest reads reassemble `{ [component]: {
  ssrDefaults } }` from the per-component `dist/templates/*.ssr-
  defaults.json` files `@barefootjs/vite`'s core plugin writes, instead of
  the legacy CLI's single combined `manifest.json`.

Third confirmation of the `@barefootjs/blade/vite` changeset's finding:
writing the SAME `/vite` shape a third time, for a third template-string
adapter, was fully mechanical, and needed strictly less than Go's reference
— not an equal amount reshaped.

`integrations/rails` and `integrations/sinatra` both move onto this
package's `/vite` in this PR (`config/initializers/example_app.rb`'s
`BLOG_MANIFEST`/Rails, `app.rb`'s `BLOG_MANIFEST`/Sinatra — both
`symbolize_names: true`, both reassembled from the per-component
`dist/templates/*.ssr-defaults.json` files the same way as Laravel's/
Django's PHP/Python read sides, just keyed by `Symbol` instead of
`String` since every existing call site already does `entry[:ssrDefaults]`).
Each integration's own 104-test Playwright E2E suite passes end-to-end
against its migrated build, run twice for stability.
