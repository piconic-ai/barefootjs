---
"@barefootjs/jinja": minor
---

Add `@barefootjs/jinja/vite`, a composed Vite plugin for Python/Jinja2

A new subpath exporting `barefoot` (named AND default, matching core's own
`packages/vite/src/index.ts` shape, and `@barefootjs/go-template/vite`'s /
`@barefootjs/hono/vite`'s / `@barefootjs/blade/vite`'s naming, exactly):

```ts
import { barefoot } from '@barefootjs/jinja/vite'

export default defineConfig({
  base: '/integrations/django/client/',
  build: { outDir: 'dist/client' },
  plugins: barefoot({
    components: ['../shared/components', '../shared/blog'],
    templates: 'dist/templates',
  }),
})
```

No `adapter` option — this constructs `JinjaAdapter` itself. Byte-for-byte
the same shape as `@barefootjs/blade/vite` (see that changeset for the full
design writeup): no `afterEmit`-driven type combination
(`JinjaAdapter.generate()` never produces a `types` section — `./build.ts`'s
`createConfig` has no default `postBuild` either), no `adapterOptions`
(`JinjaAdapterOptions`'s two fields are dead once `scriptAssets` is always
resolved), and `assets` ports over unchanged except the generated file is
plain JSON (`dist/bf-assets.json`, gitignored, regenerated every build) —
Python reads it at request time, nothing to commit.

Also carries the two `@barefootjs/blade/vite` fixes needed for the port to
actually build, since `@barefootjs/jinja/src/adapter/expr/emitters.ts` has
the identical TS-constructor-parameter-property shape:

- `JinjaFilterEmitter`/`JinjaTopLevelEmitter`'s constructors rewritten as
  plain field declarations + explicit assignment (Node's native TS
  stripping, which Vite's `bundleConfigFile` externalization triggers for
  this file, does not support parameter properties).
- `app.py`'s `MANIFEST` reads the single combined `dist/templates/
  manifest.json` `@barefootjs/vite`'s core plugin now writes (see that
  package's own changeset in this PR) — byte-for-byte the pre-migration
  code, unchanged from the legacy CLI's own manifest shape.

Ports `integrations/django` (the first of three integrations moving onto
this adapter — `fastapi`/`flask` next) the same way `laravel` proved
`@barefootjs/blade/vite`: `vite.config.ts` replaces `barefoot.config.ts`
for `build`/`build:watch`, `build.outDir` scoped to `dist/client` (matching
the existing `client_static`/`styles_static` Django views), and `app.py`'s
import map deleted the same way as `ExampleApp.php`'s.
`integrations/django`'s Playwright E2E suite (104 tests) passes end-to-end
against the migrated build, run twice for stability. `integrations/fastapi`
and `integrations/flask` follow the identical pattern (StaticFiles mount /
Blueprint `url_prefix` instead of Django's `path()` dispatch, otherwise
byte-for-byte the same `vite.config.ts` and `MANIFEST`/`ASSETS` reads);
each also passes its own 104-test Playwright suite, run twice.

Confirms the `@barefootjs/blade/vite` changeset's finding a second time:
writing the SAME `/vite` shape for a second template-string adapter was
fully mechanical, and needed strictly less than Go's reference (no type
combining, no adapter options), not an equal amount reshaped.
