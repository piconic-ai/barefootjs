---
"@barefootjs/rust": minor
---

Add `@barefootjs/rust/vite`, a composed Vite plugin for Rust/minijinja

A new subpath exporting `barefoot` (named AND default, matching core's own
`packages/vite/src/index.ts` shape, and this PR's other template-string
adapters' naming, exactly):

```ts
import { barefoot } from '@barefootjs/rust/vite'

export default defineConfig({
  base: '/integrations/axum/client/',
  build: { outDir: 'dist/client' },
  plugins: barefoot({
    components: ['../shared/components', '../shared/blog'],
    templates: 'dist/templates',
  }),
})
```

No `adapter` option — this constructs `MinijinjaAdapter` itself. Byte-for-
byte the same shape as `@barefootjs/blade/vite`/`@barefootjs/jinja/vite`/
`@barefootjs/erb/vite`/`@barefootjs/twig/vite`: no `afterEmit`-driven type
combination (`MinijinjaAdapter.generate()` never produces a `types`
section — `./build.ts`'s `createConfig` has no default `postBuild`
either), no `adapterOptions` (`MinijinjaAdapterOptions`'s two fields are
dead once `scriptAssets` is always resolved), and `assets` ports over
unchanged except the generated file is plain JSON (`dist/bf-assets.json`,
gitignored, regenerated every build) — the Rust binary reads it once at
startup, nothing to commit.

Also carries the same fix the port needed to actually build: `@barefootjs/
rust/src/adapter/expr/emitters.ts` has the identical TS-constructor-
parameter-property shape (its own emitter classes are named
`JinjaFilterEmitter`/`JinjaTopLevelEmitter`, not renamed, since minijinja
is Jinja2-compatible — pre-existing naming, untouched here) — rewritten as
plain field declarations + explicit assignment.

Unlike the other four template-string adapters in this stack, this one
needed a real toolchain check first: `cargo`/`rustc` 1.94.1 were confirmed
present before planning around `integrations/axum`'s build, so this PR's
E2E claim for it is a real, not assumed, pass.

`integrations/axum` moves onto this package's `/vite` in this PR. Its
104-test Playwright E2E suite passes end-to-end against the migrated
build (verified with a real `cargo build`/`cargo run`).
