---
"@barefootjs/vite": minor
"@barefootjs/go-template": minor
---

Add the `afterEmit` escape hatch, and `@barefootjs/go-template/vite`: a composed Vite plugin for Go

Every adapter's `.tsx` compile can produce a `types` fragment alongside its
template (e.g. Go's per-component Props struct) — but the fragment is
incomplete on its own: Go's, for instance, calls `randomID(6)` without
defining it, and per-component `package`/`import` headers need stripping
and merging into ONE file Go's compiler will accept (`html/template`
adapters don't get to just concatenate). The legacy CLI did this combining
in each adapter's `barefoot.config.ts` `postBuild` hook; `@barefootjs/vite`
had no equivalent, so an adapter migrating onto it lost the ability to
produce a compilable backend output at all.

`afterEmit` closes that gap with the narrowest context that can: `types`
(a `Map<absolute source path, types content>`), `projectDir` /
`templatesDir` / `outDir`, and `mode: 'build' | 'dev'` — fired once at the
end of EITHER eager pass, not just `vite build`'s `writeBundle` (an
adapter's derived output, like Go's `components.go`, has to exist for
`go run .` to even compile in dev). It deliberately never carries emitted
client JS: that's the one thing CLAUDE.md's "never add compiler
options/hooks for tool-specific output rewriting" rule exists to keep off
the table, and the type itself — not just convention — makes handing it
over impossible.

This option is aimed at an adapter's own `/vite` subpath (e.g.
`@barefootjs/go-template/vite`, added in a follow-up commit on this same
PR), which wires its own `afterEmit` internally to combine `types` into one
backend-native file — not something most end users are expected to pass
directly.

## `@barefootjs/go-template/vite`

A new subpath exporting `barefoot` (named AND default, matching core's
own `packages/vite/src/index.ts` shape exactly) — a Go-specific
COMPOSITION of core's `barefoot()`, not a new plugin implementation:

```ts
import { barefoot } from '@barefootjs/go-template/vite'

export default defineConfig({
  base: '/static/build/',
  build: { outDir: 'static/build' },
  plugins: [barefoot({
    components: ['src/components'],
    templates: 'internal/views',
    packageName: 'main',
    typesOutputFile: 'components.go',
  })],
})
```

No `adapter` option — this constructs `GoTemplateAdapter` itself and wires
its own `afterEmit` to combine every discovered file's `types` fragment
into one compilable `components.go` via the EXISTING, already-pure
`combineGoTypes` (`@barefootjs/go-template/build`) — reused, not
reimplemented. Ports `packageName` / `typesOutputFile` (default
`components.go`) / `manualTypes` / `transformTypes` from `./build`'s
`createConfig`, plus its write-if-changed behavior (an unrelated eager
pass touching `components.go`'s mtime would falsely trip a Go-side file
watcher like `air`). `./build` and `createConfig` are NOT removed — both
subpaths coexist until the legacy CLI itself is retired in a later PR.

An additional `assets` option (+ `assetsOutputFile`, default
`bf_assets.go`) resolves a hand-written, non-component script entry's
Vite-bundled URL (dev origin, or build manifest hash) into a generated Go
map — needed by `integrations/gin`'s blog router bootstrap script, which
isn't a `.tsx` component so core's own discovery/`scriptAssets` never sees
it. You still register the entry as a Rollup input yourself via stock
`build.rollupOptions.input`; this option only resolves the URL, it doesn't
request the bundling — same "bundling config is stock Vite config"
boundary as everything else in this design.

## `integrations/gin` migrated to Vite (first non-JS-backend proof)

`integrations/gin` is the first Go-backed BarefootJS app on this plugin —
the whole point of this stack, and the first time BOTH engines had to work
against real cross-component composition, not fixture-sized examples.
Doing that surfaced three CORE bugs in `@barefootjs/vite` (not gin-specific
workarounds — all three are fixed in `packages/vite/src/plugin.ts` and
would affect any adapter):

- **Missing `siblingTemplatesRegistered: true`.** Any component using a
  sibling-imported child inside a `.map()` loop (`TodoAppSSR` + `TodoItem`)
  hit BF103 (`Component <X> is imported from a sibling module and used
  inside a loop`) — a real diagnostic for a real cross-template-lookup
  risk, but one this plugin's OWN design already satisfies unconditionally
  (the eager pass always writes every discovered template into the same
  `templates` dir for the app to register together — see `plugin.ts`'s
  docstring). The legacy CLI sets this flag unconditionally for the exact
  same reason; the Vite plugin's `compileJSX` calls now do too.
- **The `@bf-child:<Name>` marker had no resolution story at all.** The
  compiler emits `import '/* @bf-child:ChildName */'` for every other
  component a `.tsx` file references (loop children, `initChild`-driven
  nested components); the legacy CLI's `combineParentChildClientJs`
  resolved it by physically inlining the child's JS. Fed to Rollup
  unresolved, the literal string fails outright
  (`UNRESOLVED_IMPORT`/`Rollup failed to resolve import`). Dropping it
  (resolving to an empty module) is SOMETIMES safe — an `initChild`-hydrated
  child is load-order-tolerant by design (`registry.ts`'s
  `pendingChildInits` queue) — but NOT for a purely client-rendered loop
  (`TodoApp`'s `.map()` over `initialTodos`, as opposed to `TodoAppSSR`'s
  server-rendered rows): `createComponent`'s registry lookup
  (`packages/client/src/runtime/component.ts`) has NO queueing and
  silently renders a placeholder forever if the child's script never
  loads. `resolveId` now resolves a `@bf-child:` marker to the named
  child's REAL `.tsx` file (via a name→path index built at
  `configResolved`) when discovery finds one, so Rollup wires a real
  entry-to-entry import — the SAME mechanism that already makes
  `@barefootjs/client` a shared chunk, just applied to sibling components
  too. Falls back to the empty no-op module for a name the simple
  one-component-per-file index can't cover, rather than failing the build.
- **`rollupOptions.input`'s object key broke for `components` dirs outside
  the Vite root.** This repo's own real layouts already exercise that
  shape (`components` as a sibling of root, not a descendant — see the dev
  server's own docstring), but gin's TWO configured dirs
  (`../shared/components`, `../shared/blog`) are the first BUILD-time
  (not just dev-time) proof: the root-relative key Rollup uses as the
  `[name]` chunk-naming substitution came out `../`-prefixed, which Rollup
  rejects outright (`Invalid substitution "…" for placeholder "[name]"`).
  `safeRollupEntryName` falls back to the file's position under its
  configured `componentDir` for an out-of-root file — short and readable
  (`blog/LikeButton`), not the bare absolute filesystem path (which would
  also avoid the crash, but bakes the build machine's own directory
  structure into every output filename).

None of these three would have been caught by PR01-03's own fixtures —
none of them exercised a genuinely cross-component composition (a loop
body rendering a sibling-imported child) or an out-of-root `components`
dir at BUILD time. `integrations/gin`'s Playwright E2E suite (104 tests,
covering every demo page plus the `@barefootjs/router` blog) passes
end-to-end against the migrated build.

One divergence NOT fixed here, reported rather than patched around: a
`createMemo` computed directly from a destructured/accessed PROP (not a
signal — e.g. `const displayValue = createMemo(() => props.value * 10)`)
infers a less precise Go type (`interface{}` instead of `int`) than the
legacy CLI's build, which passes a shared `ts.Program` across the whole
project to `compileJSX` for full cross-file type-checking; this plugin
does not build or share one. The value is still correct at runtime
(`interface{}` holds and JSON-marshals it fine — the E2E suite's own
`reactive-props` coverage of this exact component passes), so this is a
codegen-precision gap, not a correctness bug, but it's real and worth its
own follow-up (threading a shared `ts.Program` through the compile cache).
