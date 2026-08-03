---
"@barefootjs/twig": minor
---

Add `@barefootjs/twig/vite`, a composed Vite plugin for PHP/Twig

A new subpath exporting `barefoot` (named AND default, matching core's own
`packages/vite/src/index.ts` shape, and `@barefootjs/go-template/vite`'s /
`@barefootjs/hono/vite`'s / `@barefootjs/blade/vite`'s / `@barefootjs/jinja/
vite`'s / `@barefootjs/erb/vite`'s naming, exactly):

```ts
import { barefoot } from '@barefootjs/twig/vite'

export default defineConfig({
  base: '/integrations/php/client/',
  build: { outDir: 'dist/client' },
  plugins: barefoot({
    components: ['../shared/components', '../shared/blog'],
    templates: 'dist/templates',
  }),
})
```

No `adapter` option — this constructs `TwigAdapter` itself. Byte-for-byte
the same shape as `@barefootjs/blade/vite`/`@barefootjs/jinja/vite`/
`@barefootjs/erb/vite` (see those changesets for the full design writeup):
no `afterEmit`-driven type combination (`TwigAdapter.generate()` never
produces a `types` section — `./build.ts`'s `createConfig` has no default
`postBuild` either), no `adapterOptions` (`TwigAdapterOptions`'s two fields
are dead once `scriptAssets` is always resolved), and `assets` ports over
unchanged except the generated file is plain JSON (`dist/bf-assets.json`,
gitignored, regenerated every build) — PHP reads it at request time,
nothing to commit.

Also carries the same fix the port needed to actually build: `@barefootjs/
twig/src/adapter/expr/emitters.ts` has the identical TS-constructor-
parameter-property shape — `TwigFilterEmitter`/`TwigTopLevelEmitter`'s
constructors rewritten as plain field declarations + explicit assignment.

Fourth confirmation of the `@barefootjs/blade/vite` changeset's finding:
writing the SAME `/vite` shape a fourth time, for a fourth template-string
adapter, was fully mechanical, and needed strictly less than Go's reference
— not an equal amount reshaped.

`integrations/php` moves onto this package's `/vite` in this PR. Its
104-test Playwright E2E suite passes end-to-end against the migrated
build.
