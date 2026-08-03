---
"@barefootjs/mojolicious": minor
---

Add `@barefootjs/mojolicious/vite`, a composed Vite plugin for Perl/Mojolicious

A new subpath exporting `barefoot` (named AND default, matching core's own
`packages/vite/src/index.ts` shape, and this PR's other template-string
adapters' naming, exactly):

```ts
import { barefoot } from '@barefootjs/mojolicious/vite'

export default defineConfig({
  base: '/integrations/mojolicious/client/',
  build: { outDir: 'dist/client' },
  plugins: barefoot({
    components: ['../shared/components', '../shared/blog'],
    templates: 'dist/templates',
  }),
})
```

No `adapter` option — this constructs `MojoAdapter` itself. Byte-for-byte
the same shape as `@barefootjs/blade/vite`/`@barefootjs/jinja/vite`/
`@barefootjs/erb/vite`/`@barefootjs/twig/vite`: no `afterEmit`-driven type
combination (`MojoAdapter.generate()` never produces a `types` section —
`./build.ts`'s `createConfig` has no default `postBuild` either), no
`adapterOptions` (`MojoAdapterOptions`'s two fields are dead once
`scriptAssets` is always resolved), and `assets` ports over unchanged
except the generated file is plain JSON (`dist/bf-assets.json`, gitignored,
regenerated every build) — Perl reads it at request time, nothing to
commit.

Also carries the same fix the port needed to actually build: `@barefootjs/
mojolicious/src/adapter/expr/emitters.ts` has the identical TS-constructor-
parameter-property shape — `MojoFilterEmitter`/`MojoTopLevelEmitter`'s
constructors rewritten as plain field declarations + explicit assignment.

Mojolicious was not preinstalled in this environment; installed via
`cpanm --notest Mojolicious` to get a real E2E run rather than an assumed
one. That real run surfaced a pre-existing, unrelated bug in
`integrations/mojolicious/app.pl`'s `/blog` route (a missing `root` seed —
see that migration's own commit), never exercised before because `bun
test` always skips Mojo rendering when Mojolicious isn't installed.

`integrations/mojolicious` moves onto this package's `/vite` in this PR.
Its 104-test Playwright E2E suite passes end-to-end against the migrated
build.
