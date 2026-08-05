---
"@barefootjs/xslate": minor
---

Add `@barefootjs/xslate/vite`, a composed Vite plugin for Perl/Text::Xslate

A new subpath exporting `barefoot` (named AND default, matching core's own
`packages/vite/src/index.ts` shape, and this PR's other template-string
adapters' naming, exactly):

```ts
import { barefoot } from '@barefootjs/xslate/vite'

export default defineConfig({
  base: '/integrations/xslate/client/',
  build: { outDir: 'dist/client' },
  plugins: barefoot({
    components: ['../shared/components', '../shared/blog'],
    templates: 'dist/templates',
  }),
})
```

No `adapter` option — this constructs `XslateAdapter` itself. Byte-for-byte
the same shape as `@barefootjs/blade/vite`/`@barefootjs/jinja/vite`/
`@barefootjs/erb/vite`/`@barefootjs/twig/vite`/`@barefootjs/mojolicious/
vite`: no `afterEmit`-driven type combination (`XslateAdapter.generate()`
never produces a `types` section — `./build.ts`'s `createConfig` has no
default `postBuild` either), no `adapterOptions` (`XslateAdapterOptions`'s
two fields are dead once `scriptAssets` is always resolved), and `assets`
ports over unchanged except the generated file is plain JSON
(`dist/bf-assets.json`, gitignored, regenerated every build) — Perl reads
it at request time, nothing to commit.

Also carries the same fix the port needed to actually build: `@barefootjs/
xslate/src/adapter/expr/emitters.ts` has the identical TS-constructor-
parameter-property shape — `XslateFilterEmitter`/`XslateTopLevelEmitter`'s
constructors rewritten as plain field declarations + explicit assignment.

Text::Xslate, Plack, and Starman were not preinstalled in this environment;
installed via `cpanm --notest Text::Xslate Plack Starman JSON::PP` to get a
real E2E run rather than an assumed one. That real run surfaced two
pre-existing, unrelated bugs in `integrations/xslate/app.psgi` (a missing
`root` seed on the `/blog` route's PostList, and a strict-arity Perl
signature on the generic `render_component` helper's child renderer that
crashed on the framework's real two-argument renderer contract — see that
migration's own commit), never exercised before because `bun test` always
skips Xslate rendering when Text::Xslate isn't installed.

`integrations/xslate` moves onto this package's `/vite` in this PR. Its
104-test Playwright E2E suite passes end-to-end against the migrated build,
with both fixes applied.
