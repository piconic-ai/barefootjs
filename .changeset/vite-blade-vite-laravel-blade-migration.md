---
"@barefootjs/blade": minor
---

Add `@barefootjs/blade/vite`, a composed Vite plugin for PHP/Blade

A new subpath exporting `barefoot` (named AND default, matching core's own
`packages/vite/src/index.ts` shape, and `@barefootjs/go-template/vite`'s /
`@barefootjs/hono/vite`'s naming, exactly):

```ts
import { barefoot } from '@barefootjs/blade/vite'

export default defineConfig({
  base: '/integrations/laravel/client/',
  build: { outDir: 'dist/client' },
  plugins: barefoot({
    components: ['../shared/components', '../shared/blog'],
    templates: 'dist/templates',
  }),
})
```

No `adapter` option — this constructs `BladeAdapter` itself.

## Turns out to be MORE mechanical than Go's, not less

The brief asked: does writing `@barefootjs/go-template/vite` a second time
(for a template-string adapter, not a compiled-binary one) stay mechanical,
or does it reveal that the Go reference was Go-specific? Answer: the shape
transcribes perfectly, but two of Go's three moving pieces turn out to be
Go-only weight this port sheds outright, not carries over:

- **No `afterEmit`-driven type combination at all.** Go's `postBuild`
  (`./build.ts`'s `createConfig`) has real default behavior: combine every
  file's Props-struct fragment into one `components.go`, because Go's
  per-file fragments share a `randomID` helper and a package header, and an
  unused import fails the build outright. Reading `@barefootjs/blade/
  build.ts`'s `createConfig` shows it has **no default `postBuild` of its
  own** — it only forwards a caller-supplied one verbatim, because
  `BladeAdapter.generate()` never produces a `types` section (`sections.types`
  is always `''` — PHP templates have no imports/types/exports to combine).
  So `@barefootjs/blade/vite`'s `afterEmit` does nothing for `types` at all;
  there is no Go-shaped combining step to port because there is nothing to
  combine, and no compiler to please by removing an unused import.
- **No `adapterOptions` field either.** `BladeAdapterOptions`'s only two
  fields, `clientJsBasePath`/`barefootJsPath`, are dead code once Vite
  drives the build: `BladeAdapter.generateScriptRegistrations` only falls
  back to them when `scriptAssets` is `undefined`, and core's `barefoot()`
  plugin ALWAYS passes a resolved `scriptAssets` array. Unlike Go
  (`packageName`, still real) or Hono (`clientJsFilename`, still real),
  Blade has no adapter option left with any effect — so this options
  interface omits the field rather than plumbing through something that
  would always be ignored.
- **`assets` DOES port over, unchanged in shape.** A hand-written
  `client/router-entry.ts` (the `@barefootjs/router` blog bootstrap) still
  needs its Vite-resolved URL exposed to the PHP app, the same problem Go/
  Hono solve with the same `assets` option and companion config-capture
  plugin (`configResolved`/`configureServer` closures feeding `afterEmit`,
  since `AfterEmitContext` deliberately carries neither). The ONE real
  difference: the generated file is plain **JSON** (`dist/bf-assets.json`),
  not generated Go/TS source — PHP reads it at request time (no compile
  step), so there's nothing to commit; unlike Go's `bf_assets.go` (checked
  in, because Go must compile a static map into the binary), this file
  lives under `dist/` (already gitignored) and is regenerated fresh on
  every build, dev or production.

## Conclusion for the design brief's question

`@barefootjs/go-template/vite`'s SHAPE (adapter construction + optional
`afterEmit` + optional `assets`) generalizes cleanly — nothing in it needed
bending to fit Blade. But its CONTENT is more Go-specific than the shape:
the type-combination machinery and the `adapterOptions` passthrough are
both artifacts of Go being a compiled language with real adapter-side
runtime configuration, not general template-adapter needs. A template
adapter with no compile step and no adapter-side runtime configuration
(Blade, and — per the same reasoning — Jinja2 and ERB) needs
STRICTLY LESS than Go's reference, not an equal amount reshaped.
