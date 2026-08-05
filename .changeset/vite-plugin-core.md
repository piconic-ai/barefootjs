---
"@barefootjs/vite": minor
"@barefootjs/jsx": patch
---

Add `@barefootjs/vite`: a Vite plugin that takes over the client-asset half of `bf build`

`bf build` currently owns the whole bundler job itself — esbuild invocation,
externals/importmap, vendor chunk splitting, content hashing, tree-shaking,
relative-import resolution, build caching (`packages/cli/src/lib/build.ts`,
2400+ lines). `@barefootjs/vite` hands all of that to Vite/Rollup and keeps
BarefootJS focused on its actual job: JSX → (template, client JS). The
public surface is three options — `adapter`, `components`, `templates` —
everything else (`minify`, `outDir`, content hashing, externals, chunk
splitting, `base`) is stock Vite config the user already knows.

Two engines, sharing one content-hash-keyed compile cache so no file is
compiled more than necessary:

- a **graph pass** (`transform`, `enforce: 'pre'`) — Rollup visits `.tsx`
  modules reachable from `build.rollupOptions.input` (every `'use client'`
  component under `components`); this plugin compiles each one and hands
  back plain client JS, which survives Vite's built-in esbuild pass
  untouched and gets bundled, hashed, tree-shaken, chunked, and minified
  like any other module. A `resolveId` shim maps the compiler's
  `./foo.client.js` sibling-import specifier (emitted only for relative
  imports of client-signal-exporting modules) back to the real `./foo.tsx`
  — alias imports need no shim, `resolve.alias` already resolves them.
- an **eager pass** (`writeBundle`) — walks every `.tsx` under `components`
  directly, not via Rollup's module graph. Server-only components (no
  `'use client'`) never appear in that graph at all (nothing imports them
  as a script) but still need a template — this pass is the only place
  that happens, and it runs in `writeBundle` specifically because Vite's
  manifest (`build.manifest`, forced on) is only final once Rollup has
  hashed every output filename. For each `'use client'` component, its
  entry's real hashed URL is resolved from the manifest and passed as
  `AdapterGenerateOptions.scriptAssets` (see the `adapter-script-assets`
  changeset) so the emitted template registers the actual, `base`-prefixed
  built asset — never a shared-runtime script tag, since the runtime now
  arrives as an ESM import of a shared chunk the browser follows on its
  own.

`@barefootjs/jsx`: `CompileOptions` gains `scriptAssets?: string[]`,
threaded straight through to `adapter.generate()`. `AdapterGenerateOptions
.scriptAssets` shipped in the prior PR, but nothing between it and
`compileJSX`'s callers existed to reach it — this closes that gap. Plain
resolved data forwarded unchanged, not a rewrite hook.

`@barefootjs/client` is deliberately left WITHOUT a `sideEffects: false`
declaration. Adding one looks correct — and Rollup does tree-shake the
runtime down to just the exports a project uses, verified against a real
`vite build` — but it breaks the package's own build: `bun build
./src/index.ts --external '@barefootjs/client/reactive'` then drops the
external re-export's import while keeping the `export { … }` list, so
every name in `dist/index.js` becomes "not declared in this file" and
every downstream consumer fails to load. Tree-shaking already works
without the field; do not re-add it without fixing `build:js` first.

Out of scope for this change (tracked as follow-ups): the dev server /
HMR / full-reload story (`configureServer`), migrating the 19
`integrations/*` example apps, and combining per-file adapter `types`
output (e.g. Go's Props structs) into one backend-native file (Go's
`components.go` combination — deduped `package`/import header plus a
shared `randomID` helper — lives entirely in `@barefootjs/go-template`'s
`barefoot.config.ts` factory today; this plugin has no equivalent hook
yet, so it writes each component's raw `types` fragment to its own
`.types` file next to its template instead of combining them).
