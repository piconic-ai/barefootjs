---
"@barefootjs/vite": minor
---

Write a combined `manifest.json` (matching the legacy CLI's shape exactly), alongside the per-component `.ssr-defaults.json` files

`@barefootjs/vite`'s core `barefoot()` plugin already wrote one
`<Name>.ssr-defaults.json` per component next to its template — a
deliberate per-file choice (see `emit.ts`'s own docstring on why `types`
fragments are written raw, not combined). What it didn't write was the
legacy CLI's single combined `dist/templates/manifest.json`, keyed by
component, that every PHP/Python/Ruby backend driving a `templatesPerComponent`
adapter (Blade/Jinja2/ERB) reads `ssrDefaults` from at REQUEST time — there
is no compile step for these languages to bake an optional-prop-derived
signal's SSR seed value into source the way Go's generated `NewXxxProps`
constructor or Hono's self-contained `.tsx` file can.

Caught in review of the Blade/Jinja/ERB `/vite` PR: the first pass closed
this gap on the READ side — each of Laravel/Blade/Django/FastAPI/Flask/
Rails/Sinatra glob-and-reassembled the identical `{ [component]: {
ssrDefaults } }` shape from the per-component files. That worked, but it
was seven copies of the same reconstruction logic across three languages,
absorbing a difference the pipeline used to paper over for free — and
stack 7 (removing the legacy CLI) would have made "the new pipeline
doesn't emit a manifest" a silent, undiffable capability regression.

Fixed in core instead: `buildManifestEntry` (new, `component-manifest.ts`)
reproduces `packages/cli/src/lib/build-cache.ts`'s `ManifestEntry` /
`ManifestComponentEntry` shape and `packages/cli/src/lib/build.ts`'s
manifest-building logic, verified by reading both directly (not inferred
from a consumer):

- Keyed by the source file's path relative to its `components` dir, extension
  stripped (`Counter`, or `ui/toast/index` for a multi-export file) — same
  as the legacy CLI's `baseNameNoExt`.
- `ssrDefaults` is an ABSENT key (not `{}`) when a component has none —
  verified with a fabricated no-ssrDefaults `CompileResult` in
  `component-manifest.test.ts`, since a subtle `{}`-vs-absent difference
  here would silently break a consumer's `array_key_exists`/`'x' in y`
  check in a way E2E might not catch.
- `components` (a `templatesPerComponent` adapter's per-exported-component
  rows) is present even for a single-component file, matching the legacy
  CLI's own unconditional-when-`templatesPerComponent` behavior.
- Pairs `markedTemplate`/`ssrDefaults` FileOutputs by `componentName`
  (always stamped by the compiler — see `compiler.ts`) rather than the
  legacy CLI's own path-basename heuristic (which existed to paper over
  esbuild's multi-physical-file output naming and has no equivalent
  ambiguity under this plugin's own per-component-name output).

Two legacy `ManifestEntry` fields are intentionally NOT reproduced —
`stubDeps` (bookkeeping for the legacy CLI's esbuild-based stub-dependency
resolution; Rollup's own module resolution makes it moot) and `clientJs`
(a static path only meaningful when the CLI itself controlled the
non-hashed output location; under Vite the real URL is content-hashed and
mode-dependent, exactly what `scriptAssets` already resolves and bakes
directly into the compiled template — no backend has ever read
`manifest[name].clientJs`, confirmed by grepping the PHP/Python/Ruby
runtimes).

Written alongside, not instead of, the per-component files (dev re-emits
of one changed component stay cheap; the combined file is rewritten whole
every eager pass, which the full-discovery-every-pass design already
implies). `@barefootjs/go-template/vite` and `@barefootjs/hono/vite` get
the same manifest for free, even though neither adapter's own runtime
reads it today (Go bakes `ssrDefaults` into generated source; Hono's
`.tsx` inlines them as JS defaults) — confirmed by grepping both
integrations' backend code for `manifest`/`ssrDefaults` reads: none exist.

The seven integrations' manifest reads were reverted back to a single
`json_decode`/`json.loads`/`JSON.parse` of `dist/templates/manifest.json` —
byte-for-byte the pre-Vite-migration code, verified by diffing against
each integration's pre-migration commit.
