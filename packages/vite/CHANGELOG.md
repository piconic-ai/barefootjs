# @barefootjs/vite

## 0.31.6

### Patch Changes

- @barefootjs/shared@0.31.6

## 0.31.5

### Patch Changes

- @barefootjs/shared@0.31.5

## 0.31.4

### Patch Changes

- @barefootjs/shared@0.31.4

## 0.31.3

### Patch Changes

- @barefootjs/shared@0.31.3

## 0.31.2

### Patch Changes

- @barefootjs/shared@0.31.2

## 0.31.1

### Patch Changes

- @barefootjs/shared@0.31.1

## 0.31.0

### Minor Changes

- 8b2673f: Share one ts.Program across every compile in the Vite plugin — and unblock Reactive<T>-brand components from building through it at all

  Type-based reactivity detection (Reactive<T> brand classification, the
  BF023/BF024 nullable-loop-key check) needs a `ts.TypeChecker`. The plugin
  never passed `CompileOptions.program`, so every type-needing file paid its
  own `ts.createProgram` inside `compileJSX`'s per-file fallback — and the
  dominant cost of that call is constructing the lib.d.ts/node_modules type
  graph, not parsing the one source file (~500-800 ms per call regardless of
  file size; 36-52 s extrapolated across site/ui's 67 type-needing files).
  Worse than slow: a file importing a Reactive<T>-branded package
  (`@barefootjs/form`) got BF050 at severity `error` without a shared
  Program, and the plugin throws on error diagnostics — such a file could
  not build through the plugin at all.

  `@barefootjs/vite` now maintains a `CorpusProgramManager`: one Program
  whose roots are every discovered file that `needsTypeBasedDetection` says
  needs a checker, built once per pass and passed to every compile (both the
  cached canonical compile and the eager pass's scriptAssets recompile).
  Watch-mode rebuilds go through `ts.createProgram`'s `oldProgram`
  incremental path, and in-memory content that diverges from disk falls back
  to a virtual single-file Program rather than ever handing the analyzer a
  Program it would reject. Measured on the site/ui corpus: 11.2 s for the
  67-file type-needing subset (seed + compile) versus 36-52 s extrapolated
  per-file, with zero per-file Program creations.

  `@barefootjs/jsx` fixes two defects the same measurement surfaced:

  - **BF050 single/multi asymmetry**: the multi-component path pre-builds a
    per-file Program to amortize it across siblings and passed it down as if
    the caller had supplied it, suppressing BF050 — so the same brand import
    failed in a single-component file but silently relied on the per-file
    fallback in a multi-component one. BF050 now keys off whether the CALLER
    supplied `options.program` (`analyzeComponent`'s new `programIsShared`
    parameter), in both paths, and a multi-component file reports it once
    rather than once per sibling.
  - **Stale-Program rebuild storm**: when an upstream rewrite
    (`preprocessInlineJsxCallbacks`, #1211) makes a caller-supplied Program
    stale, the analyzer silently discarded it PER COMPONENT and rebuilt a
    per-file Program each time — 14 rebuilds ≈ 30 s on site/ui's
    `xyflow-demo.tsx` alone. The multi-component path now detects the
    staleness up front and builds ONE per-file Program for the rewritten
    source, shared by every sibling.

- 3a44cd2: Emit `<link rel="modulepreload">` hints for a component's transitively-shared chunks

  A compiled template registers exactly ONE script — the component's own entry:

  ```js
  registerComponentScripts([
    "/integrations/hono/static/components/assets/TodoApp.tsx-CtatJ74J.js",
  ]);
  ```

  But that entry is not a leaf. Vite's build manifest for the same component says:

  ```json
  "../shared/components/TodoApp.tsx": {
    "file": "assets/TodoApp.tsx-CtatJ74J.js",
    "imports": ["_index-xrhpkKRC.js", "../shared/components/TodoItem.tsx"]
  }
  ```

  and `TodoItem.tsx` in turn imports `_index-xrhpkKRC.js` (the shared runtime
  chunk, a leaf). So the browser's real load sequence was two sequential waves:

  1. fetch + parse `TodoApp.tsx-<hash>.js`
  2. only now discover, and fetch, `TodoItem.tsx-<hash>.js` and `index-<hash>.js`

  Nothing emitted a `modulepreload` hint anywhere in the repo, so wave 2 always
  cost a full extra round trip. On localhost that is invisible — which is
  exactly why the benchmark suite does not catch this win — but on a
  100ms-RTT connection it is 100ms of dead time before an island can hydrate.

  `AdapterGenerateOptions.preloadAssets` (a sibling of `scriptAssets`) carries
  an ordered, fully-resolved list of the entry's transitive chunk URLs,
  excluding the entry's own file. `@barefootjs/vite`'s `resolvePreloadAssets`
  resolves it from the build manifest by walking `entry.imports`
  breadth-first (deterministic order, deduped, cycle-safe) — deliberately NOT
  following `dynamicImports`, since a dynamic import is by definition not
  needed for first paint. Every adapter emits a `<link rel="modulepreload"
crossorigin href="…">` immediately before its `scriptAssets` registrations,
  in each adapter's own native form. `undefined` means "no preload
  information" (emits nothing); `[]` means "resolved, nothing to preload"
  (also emits nothing) — the same `undefined`/`[]` distinction `scriptAssets`
  already draws. `skipScriptRegistration` still wins over both unconditionally.

  In dev, Vite serves unbundled modules with its own on-demand dependency
  pre-bundling — there is no stable, hashed chunk graph to preload, so
  `preloadAssets` is always `[]` there.

  Purely additive: with `preloadAssets` unset (the default) every existing
  caller keeps byte-identical output.

  ## How the other eight get it

  They don't emit script tags inline — they call a collector
  (`bf.register_script(...)`) whose output the app's layout renders elsewhere.
  So the preloads travel the same path: a `register_preload` collector in each
  of the six native runtimes (Rust, PHP, Ruby, Perl, Python, Go), with its own
  dedup set, and the EXISTING script-render helper extended to emit the
  `<link rel="modulepreload" crossorigin>` tags ahead of the
  `<script type="module">` tags it already emits. Extending that helper is what
  keeps this non-breaking: no integration's layout changes.

  The adapters emit a no-output register statement, never a literal `<link>` —
  `{% set %}` produces nothing, while a `<link>` element renders and would
  inject a node before the component's root, breaking hydration's DOM claim
  paths.

  An app that also threads the collector into its child renderers (two lines
  mirroring the `_scripts`/`_script_seen` threading already there) gets hints
  for chunks registered inside a child too. Skipping that keeps the app
  working, just with fewer hints — verified against four integrations left
  unmodified on purpose (fastapi, sinatra, xslate, gin), all green.

- dd2e5d8: `bf` reads project config from `vite.config.ts`, unblocking deletion of the legacy build pipeline

  All nineteen integrations are migrated to `@barefootjs/vite`, but twenty-two
  `bf` commands (`docs`, `debug graph`, `debug profile`, `gen-component`,
  `gen-test`, `meta extract`, `search`, `tokens`, `preview`, and more) still
  derived their project context — `paths` and `sourceDirs` — from
  `barefoot.config.ts` via `packages/cli/src/context.ts`. Deleting the legacy
  config before repointing that context would break every one of them. This
  PR does the repointing; it deletes nothing.

  **`@barefootjs/vite`**: `barefoot()` now attaches its resolved `options` on
  the returned plugin's `.api` (`BarefootPluginApi`), Vite's own convention
  for exposing plugin state to other tooling. `PLUGIN_NAME` (`'barefoot'`) is
  exported alongside it so a consumer can find the plugin by name in a
  resolved Vite config's `plugins` array without hardcoding the string
  independently. Populated synchronously at `barefoot(options)` construction
  time — not from a lifecycle hook — because a caller going through Vite's
  own `loadConfigFromFile` (see below) never runs a plugin's hooks at all.

  **Every adapter's `/vite` wrapper** (`@barefootjs/go-template/vite`,
  `@barefootjs/hono/vite`, and the blade/erb/jinja/mojolicious/rust/twig/
  xslate equivalents) already returns the SAME plugin object core constructed
  as one element of its `Plugin[]` array, so `.api` survives unchanged
  through every wrapper with no code changes needed there — pinned by a new
  test in each of the two adapters most exercised elsewhere in this repo
  (`go-template`, `hono`) asserting `plugins[0].api.options` unchanged.

  **`@barefootjs/cli`**: `context.ts` now resolves project config from
  `vite.config.ts` first, reading the barefoot plugin's `components` off
  `plugin.api` via Vite's own `loadConfigFromFile` (never by text-parsing the
  config file — see CLAUDE.md's "never parse imports/TS syntax with regex or
  string matching" rule). `barefoot.config.ts` remains a fallback — read
  directly, exactly as before — for a directory that has only that file, or
  when `vite.config.ts` fails to load or has no barefoot plugin registered.
  The existing "no config found anywhere" monorepo-fallback behavior (so
  setup commands like `bf init` still work with zero config) is unchanged.
  `paths` has no equivalent on the Vite side (`BarefootViteOptions` has no
  `paths` field — no integration overrides `paths`, and there is no root or
  `ui/` config either), so the `vite.config.ts` path always uses
  `DEFAULT_PATHS`.

  Verified against real commands (`bf docs`, `bf debug graph`, `bf tokens`,
  `bf meta extract`) run from inside a migrated integration with
  `vite.config.ts` present, and again from a project with only
  `barefoot.config.ts` (no `vite.config.ts`) to confirm the fallback.

- 042a0d4: Write a combined `manifest.json` (matching the legacy CLI's shape exactly), alongside the per-component `.ssr-defaults.json` files

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

- 0e43386: Make `templates` optional, and migrate `integrations/csr` — the last of the nineteen

  `integrations/csr` is unlike the other eighteen: it emits no templates and
  does no SSR, so it needed no answer to "does `@barefootjs/client` need its
  own `/vite` package?" — it doesn't. Plain `@barefootjs/vite`'s `barefoot()`
  with `new CSRAdapter()` (`@barefootjs/client/build`'s existing sentinel
  adapter — `generate()` always returns empty output) covers it exactly.
  `CSRAdapter` is still required, not skippable: the compiler's analyzer
  consults `TemplateAdapter.acceptsTemplateCall` when deciding template- vs.
  init-scope placement for a call expression, so CSR still needs _an_ adapter
  — just one whose output is thrown away.

  ## The one thing core needed: the degenerate "no real template" case

  The eager pass previously wrote one `markedTemplate` file per discovered
  component unconditionally — for CSR that's a directory of empty `.tsx`
  files, exactly what the legacy CLI's `clientOnly` gate always avoided.
  `BarefootViteOptions.templates` is now optional; when omitted, the eager
  pass still compiles every discovered component (the graph pass needs the
  same canonical compile regardless of `templates`) but writes nothing on
  its behalf — no per-component template/`ssrDefaults`/types files, no
  `manifest.json`, no dev-artifact marker, no `afterEmit` call.

  Omitting `templates` is a claim this plugin verifies, not trusts:
  `assertNoRealTemplateOutput` refuses loudly if any discovered component's
  `markedTemplate` output turns out non-empty anyway, rather than silently
  dropping it — CLAUDE.md's sound-or-loud idiom, applied here. The check is
  scoped to `markedTemplate` content specifically, not any adapter output:
  `ssrDefaults` is derived from IR metadata independent of the adapter, and
  IS real even under `CSRAdapter` (a `Counter`'s signal default produces a
  non-empty `ssrDefaults` file regardless of what `generate()` returns) —
  treating it as loudness-worthy would make `templates` impossible to omit
  for the one adapter this option exists to accommodate. This matches the
  legacy CLI's own `clientOnly` gate exactly, which drops `ssrDefaults`
  alongside the template rather than failing over it.

  ## What CSR revealed the other eighteen couldn't

  CSR's `pages/*.html` are a genuinely different shape: static, hand-written
  HTML files with an inline `<script type="module">`, not a per-request
  server-rendered template. Each one hand-imported a fixed, un-hashed path
  (`/static/components/Counter.client.js`, matching the legacy CLI's
  un-bundled output layout) and carried a hand-written `@barefootjs/client*`
  import map (`{"@barefootjs/client/runtime": "/static/components/
barefoot.js"}`) so the browser's native module loader could resolve the
  bare specifier its own inline script used — CSR's answer to the "hand-
  written import map" every other integration has already deleted, just for
  a different reason (there being no SSR shell to embed it in) than the
  usual "Vite bundling already resolves this" one.

  Fixed by routing every `pages/*.html` through Vite's own multi-page build
  (`build.rollupOptions.input`, merged with `barefoot()`'s own component-
  derived entries) instead of serving them as static passthrough files:
  Vite rewrites each page's inline script into a real, hashed, bundled
  entry, resolving both the dynamic `import()` of the component `.tsx` file
  (now a plain relative import, e.g. `../../shared/components/Counter.tsx`)
  and the `@barefootjs/client/runtime` bare specifier — no import map
  needed. `server.ts` now serves the built `dist/pages/*.html`, not the
  `pages/` source directory.

  One CSR-specific consequence for `build:watch`: every other migrated
  integration maps it to `vite dev`, pairing a backend dev script that reads
  `templates` at request time and renders a `<script src>` pointing at
  Vite's own dev-server origin. CSR has no such backend step to bake a
  dev-origin URL into — its pages are the shell. `build:watch` instead runs
  `vite build --watch`, preserving CSR's actual prior dev loop (rebuild to
  `dist/` on save, reload the browser) rather than wiring up a cross-origin
  split that would silently never take effect.

  `barefoot.config.ts` stays, unused, until a later PR removes the legacy
  CLI outright. `integrations/csr`'s 79-test Playwright E2E suite passes
  against the migrated build with the same single pre-existing, unrelated
  failure (`ToggleItem` scope-ID format) reproduced identically against the
  legacy build — not a regression from this migration.

- 4139ce0: Add the `afterEmit` escape hatch, and `@barefootjs/go-template/vite`: a composed Vite plugin for Go

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
  import { barefoot } from "@barefootjs/go-template/vite";

  export default defineConfig({
    base: "/static/build/",
    build: { outDir: "static/build" },
    plugins: [
      barefoot({
        components: ["src/components"],
        templates: "internal/views",
        packageName: "main",
        typesOutputFile: "components.go",
      }),
    ],
  });
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

- 07b77f4: Per-directory `cssLayerPrefix` and `skipDirs` on `components` entries

  `site/ui/build.ts` compiles library components (`ui/components`) with
  `cssLayerPrefix: 'components'` and app/docs components without it — the
  cascade contract `site/ui/styles/globals.css` declares
  (`@layer preflights, base, shortcuts, components, default`): library base
  classes land in `@layer components`, user override classes stay un-layered
  in `default`, so an override always wins regardless of specificity or
  UnoCSS emission order. That distinction is load-bearing — `site/ui/components`
  passes `className` overrides roughly 490 times. `@barefootjs/vite`'s
  `barefoot()` plugin couldn't express it: whether a file needs a cascade
  layer depends on WHICH `components` entry it came from, and
  `BarefootViteOptions` is deliberately capped at exactly three fields.

  Separately, `site/ui/build.ts` skips any directory literally named `shared`
  under its roots (utility modules and non-component layouts live there).
  The low-level `discoverComponentFiles` already supported a `skipDirs`
  option; nothing in the Vite plugin plumbed it through.

  Both are directory-scoped compile behaviors, so both ride on the
  `components` entry itself instead of becoming 4th/5th top-level options.
  `components` widens from `string[]` to `(string | ComponentDirEntry)[]`:

  ```ts
  export interface ComponentDirEntry {
    dir: string;
    cssLayerPrefix?: string;
    skipDirs?: string[];
  }
  ```

  A plain string entry is exactly equivalent to `{ dir: string }` — every
  existing `vite.config.ts` in this repo (and `discoverComponents`'s two
  external consumers, `integrations/h3`/`integrations/elysia`) keeps
  compiling and behaving byte-identically, confirmed by diffing
  `integrations/hono`'s built `dist/components/` before and after this
  change. `components` entries are processed in array order, and that order
  is also the precedence when the same file is reachable under more than
  one entry: the first entry's `cssLayerPrefix`/`skipDirs` win, matching the
  first-writer-wins precedence `@bf-child:` name resolution already
  documents.

  `skipDirs` gates BOTH halves of the plugin — the eager pass's discovery
  walk AND the `transform`/dev-watcher gate (`isUnderComponentDir`). Gating
  only discovery would have been a half-fix: a file living in a skipped
  subdirectory can still be reached by an ordinary relative `import` from a
  non-skipped sibling (`site/ui`'s `PageNavigation.tsx`, imported by pages
  out of a skipped `shared/` dir, is exactly this shape), and without the
  second gate the graph pass would compile it anyway.

- c51638e: Add `@barefootjs/vite`: a Vite plugin that takes over the client-asset half of `bf build`

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

- d1d2e79: Add the dev server: `configureServer` wires `vite dev` up to real BarefootJS templates

  The prior PR gave `@barefootjs/vite` its build-time engines (`transform` for
  client JS, `writeBundle` for templates). This PR adds the third:
  `configureServer`, so `vite dev` emits real, working templates too — not
  just `vite build`.

  - **`server.watcher.add(componentDirs)` is mandatory, not a nicety.** Vite's
    own chokidar watcher only reliably covers its project `root` (plus config
    file dependencies) and whatever it has personally transformed as a module
    (`ensureWatchedFile`). Server-only components (no `'use client'`) are
    never transformed as modules — nothing ever imports them as a script —
    and in this monorepo's real layouts `components` dirs are commonly
    siblings of, not descendants of, the Vite project root (an app's
    `vite.config.ts` root is the backend app dir; components live in a shared
    `ui/`-style directory next to it). Without the explicit `add`, editing
    such a file is silently invisible to the dev server. The e2e suite pins
    this with a dedicated server instance that never fetches any `'use
client'` component over HTTP, specifically to rule out Vite's own
    `ensureWatchedFile` accidentally covering the gap.
  - **Every tracked `.tsx` change re-runs the WHOLE eager pass**, not a
    dependency-tracked diff. A change to a shared signal module or a child
    component changes the _parent's_ template too; anything less than a full
    re-run needs the dependency tracking this migration is deleting from the
    legacy CLI's `build-cache.ts`. The eager pass's existing content-hash
    `CompileCache` absorbs the cost — an unchanged file's compile is a cache
    hit regardless of which pass reaches it.
  - **`scriptAssets` for a dev `'use client'` component** is `[origin +
'/@vite/client', origin + <the component's own dev module URL>]` — the
    HMR/full-reload socket, then the component itself, served exactly like
    any other dev module via the SAME `transform` hook `vite build` uses (no
    dev-only compile path). Server-only components still get `[]`. The
    origin is resolved from the httpServer's ACTUAL bound port
    (`httpServer.address()`), never the configured one, because Vite
    auto-increments past an in-use port unless `strictPort` is set — and it's
    written back onto `server.config.server.origin` so Vite's own asset-URL
    rewriting (`import.meta.url`, CSS `url()`) agrees with what this plugin
    bakes into templates.
  - **`server.cors` gets a localhost-only default, ONLY when the user hasn't
    set one.** The page is rendered by the backend on its own origin; its
    module scripts come from Vite on another — a cross-origin split Vite 6+'s
    same-origin CORS default would reject outright. The plugin option surface
    stays exactly `adapter` / `components` / `templates`; no fourth
    `devOrigin`-shaped option was added to support this. Done in the `config`
    hook (not `configureServer`) so it's plain, synchronously mergeable data
    Vite applies before installing its own CORS middleware, not a hook-timing
    bet against Vite's internal setup order.
  - **Dev-artifact marker.** `templates/.barefootjs-dev-build` is written
    alongside every dev-emitted template and removed by the next `vite build`
    — a warning that the directory currently holds dev-only URLs
    (`http://localhost:<port>/...`) that will break if committed or deployed.
    A per-adapter template comment (Go `{{/* … */}}`, ERB `<%# … %>`, etc.)
    would pinpoint the problem more precisely, but needs new surface on every
    `TemplateAdapter` implementation across 9+ adapter packages unrelated to
    the dev server itself — out of scope here. This single marker file is the
    fallback the design brief explicitly allows in that case.

  Full reload (`server.ws.send({ type: 'full-reload' })`), not fine-grained
  HMR, is correct here and not a placeholder: the page HTML is rendered by the
  backend (Go/PHP/Ruby), not by Vite, so a component's compiled output can
  only take effect on the next full backend render. Fine-grained HMR would
  need to cross a boundary this architecture doesn't have yet.

  Three fixes from review, all with regression coverage:

  - **`server.cors: false` was silently overridden.** The "fill in only when
    unset" check was `!userConfig.server?.cors`, and `!false` is `true` — a
    user explicitly disabling CORS got the localhost default instead, the
    opposite of what they asked for. Fixed to check `=== undefined`
    specifically; falsy-but-set (`false`) now survives untouched, same as any
    other explicit value.
  - **Adding or deleting a component file during a dev session did nothing.**
    Only `'change'` was handled; chokidar emits `'add'` and `'unlink'`
    separately. A new file got no template until some unrelated file
    happened to change and dragged it along on the next full pass; a deleted
    file's template lingered on disk forever. Both are now handled: `'add'`
    triggers the same eager pass as `'change'` (it already re-discovers
    everything from disk, so no special-casing is needed for a new file);
    `'unlink'` additionally needs to know WHICH on-disk files to remove for a
    source that no longer exists to re-derive that from — solved by having
    the eager pass record what it last emitted per source file
    (`lastEmitsByAbsPath`), consulted (and then discarded, along with the
    now-stale `CompileCache` entry) when a file disappears.
  - **Rapid successive changes could run overlapping eager passes**, all
    writing the same template files with no serialization — a save-twice-
    quickly, a multi-file save, or a `git checkout` touching many files could
    trigger this, exactly the race the legacy CLI's `watch()`
    (`packages/cli/src/lib/build.ts`) debounced at 100ms to avoid. Added
    `debounced-serial-runner.ts`: a small, dependency-free primitive that
    debounces a burst of triggers into one run and, if a run is already in
    flight when the debounce fires, queues exactly one follow-up instead of
    starting a second overlapping one — a change arriving mid-pass is
    delayed, never dropped, and at most one pass is ever active. Proven
    deterministically in its own unit tests (via manually-resolved promises
    standing in for the real eager pass, since the real one finishes in
    low-single-digit milliseconds — far too fast to reliably force a
    wall-clock race in an e2e test); backed by an end-to-end test confirming
    real rapid disk writes converge on the correct final template content
    with no corruption and no crash.

  Out of scope for this change: migrating any `integrations/*` app to the new
  plugin, `packages/cli`, and combining adapter `types` output into one
  backend-native file (still tracked as a follow-up, unrelated to the dev
  server).

- 1d386fd: Export `discoverComponents` (+ `DiscoveredComponent`), and migrate five more integrations onto the existing `/vite` packages

  This PR answers the question the two `/vite` packages (`@barefootjs/go-
template/vite` from a prior PR, `@barefootjs/hono/vite` from the PR after
  it) were left with: do they generalise to integrations they weren't built
  against, or were they shaped around the one integration each already
  migrated onto them? Five more integrations move onto those SAME two
  packages, unmodified except for the one export below — `integrations/chi`,
  `integrations/echo`, `integrations/nethttp` onto `@barefootjs/go-template/
vite`, and `integrations/h3`, `integrations/elysia` onto `@barefootjs/hono/
vite`.

  ## The three Go integrations generalised with zero surprises

  `integrations/chi`, `integrations/echo`, `integrations/nethttp` are
  structurally near-identical to `integrations/gin` (same shared components,
  same hand-rolled `blogImportMap()` + hardcoded `.../static/client/router-
entry.js`, same `bundleEntries`/`clientJsBasePath` shape in
  `barefoot.config.ts`). Each migration is the mechanical application of
  gin's own migration: `vite.config.ts` replacing `barefoot.config.ts` for
  `build`/`build:watch`, `assets: { RouterEntry: routerEntry }` resolving the
  router bootstrap's hashed URL into a generated `bf_assets.go`, the import
  map deleted outright (not updated) because the runtime is a shared ESM
  chunk every island and the router bundle import normally. `echo`'s
  `ParseGlob("dist/templates/*.tmpl")` (flat, not `chi`/`nethttp`'s recursive
  `filepath.WalkDir`) needed no plugin change either — the plugin's per-
  component-dir-relative output already lands templates flat for a
  single-level `components` dir, which is what all three have. No per-
  integration special case was needed anywhere in this half.

  ## h3 and Elysia needed one real generalisation: the `assets` map, scaled up

  `integrations/hono`'s migration relies on `HonoAdapter.generate()` baking
  `registerComponentScripts(...)` calls into each compiled component, which
  read a per-request script collector off Hono's `jsxRenderer` request
  context (`useRequestContext()`). h3 and Elysia host the SAME compiled hono/
  jsx components but have NO Hono request context at all (`renderToHtml` is
  a bare `.toString()` — see `@barefootjs/hono/render`'s docstring) —
  `useRequestContext()` throws, the codegen'd calls swallow that and register
  nothing, so that mechanism silently no-ops for both. Pre-Vite, both
  integrations instead read a static `dist/components/manifest.json` and
  emitted a `<script>` for EVERY entry in it, unconditionally, on every page
  (`BfImportMap`/`BfScripts` from `@barefootjs/hono/app`) — there being no
  per-request collector to be selective with in the first place.

  Under Vite there is no such flat, unhashed manifest to read. The fix reuses
  the exact `assets` option `@barefootjs/go-template/vite`/`@barefootjs/hono/
vite` already expose for a single hand-written entry (gin's/hono's own
  `router-entry.ts`) — just fed the FULL set of discovered `'use client'`
  components instead of one hand-picked path, keyed by component name. That
  full set has to come from a real component scan, not a hand-maintained
  list (missing an entry — e.g. `PostArticle`'s nested `LikeButton`/
  `ReadingTimer` — would silently ship a page with a dead island). Core's own
  `barefoot()` plugin already runs exactly that scan internally to seed
  `build.rollupOptions.input`, but had no way to hand the result to a
  composed plugin — so `discoverComponents` (`packages/vite/src/discover.ts`)
  is now exported publicly, reused by each integration's own `vite.config.ts`
  to build its `assets` map, rather than re-walking `components` dirs with
  ad hoc logic (the same "reuse or port it, don't reinvent" rule this
  module's own docstring already invokes for `resolveScriptAssets` et al.).
  `renderer.tsx`/`blog.tsx` in both integrations replace `BfImportMap` +
  `BfScripts(manifest, base)` with a small `<ComponentScripts>` that maps the
  generated `Assets` record to `<script>` tags — same "every component,
  unconditionally" behavior as before, now content-hashed and Vite-bundled.

  No change to `@barefootjs/hono`'s adapter code was needed or made: this is
  purely an app-level (`vite.config.ts` + `renderer.tsx`/`blog.tsx`) fix,
  using `HonoAdapter.generate()`'s existing (and, for these two integrations,
  inert) `scriptAssets` codegen exactly as-is.

  ## Also verified deletable, same as gin/hono

  Both h3 and Elysia had their own copy of the `@barefootjs/client*` →
  `barefoot.js` import map (`renderer.tsx` AND `blog.tsx` each carried one) —
  deleted outright, not updated. Rollup folds every bundled entry's
  `@barefootjs/client*` import into one shared chunk regardless of which of
  the ~20 discovered components pulled it in first, so the browser needs no
  specifier redirection for a single reactive runtime instance — the same
  conclusion gin and Hono already proved, now confirmed a third and fourth
  time on hosts with no Hono request context at all.

  ## Result

  All five integrations' Playwright E2E suites pass end-to-end against their
  migrated builds (chi/echo/nethttp: 104 tests each; h3/Elysia: 58 tests
  each, including the `@barefootjs/router` blog suite exercising the new
  `<ComponentScripts>` + `Assets.RouterEntry` path), each run twice for
  stability. `barefoot.config.ts` stays, unused, in every integration until a
  later PR removes the legacy CLI outright.

### Patch Changes

- d0845b8: Correct the documentation around `BfPreload` and the plugin manifest's `clientJs` omission

  `@barefootjs/vite`'s manifest comment justified omitting `clientJs` with
  "no backend reads it (grep the PHP/Python/Ruby runtimes: zero hits)" — a
  grep scoped to native runtimes, when `@barefootjs/hono`'s `BfPreload` (not
  a native runtime) does read `clientJs` from a caller-supplied manifest.
  The omission stands; the justification now states its real scope and
  points plugin-manifest consumers at the `preloadAssets` path.

  `BfPreload`'s docs now say what silently failed before: `components`
  entries must match manifest keys exactly (path-qualified like `ui/button`
  for the legacy site build), a miss is skipped without error, and
  `ManifestEntry.dependencies` has no current producer — the dependency
  recursion only activates for hand-authored manifests.

- 137cd37: Resolve `@bf-child:` markers by exported component name, not by filename

  `buildChildNameIndex` keyed each `'use client'` file by its own basename,
  which works only because the one-component-per-file convention makes the
  two coincide (`TodoItem.tsx` exports `TodoItem`). A file exporting several
  components broke it silently: `icon/index.tsx` was keyed `index`, so a
  `@bf-child:CopyIcon` marker found nothing and fell through to the no-op
  module — a child that never hydrates, with no diagnostic to say so.

  The index now keys on every exported component name, from
  `@barefootjs/jsx`'s existing TS-AST walk (`listExportedComponents`) rather
  than a new parse or a regex. Files whose export list comes back empty still
  fall back to the basename, so the old convention keeps working.

  The blast radius was wider than multi-export files. Keyed on the bare
  basename, EVERY colocated `index.tsx` collided on the single key `"index"`
  — including single-export ones like `ui/button/index.tsx` exporting
  `Button`. No colocated component was reachable as a `@bf-child:` target at
  all, whatever its export count.

  Found while surveying `site/ui` for the `@barefootjs/vite` migration.
  Across `ui/components` + `site/ui/components`, 112 files export more than
  one component, 105 of them `'use client'`.

- 22ee474: Restore the cross-language dev-reload sentinel (`<outDir>/.dev/build-id`) from `vite dev`

  The legacy CLI's `bf build --watch` used to write `<outDir>/.dev/build-id`
  after every rebuild that changed output; several adapter runtimes still
  poll that exact path and push an SSE `event: reload` when it changes —
  `bfdev.NewReloadHandler` (Go — echo/gin/chi/nethttp),
  `Mojolicious::Plugin::BarefootJS::DevReload` / `BarefootJS::DevReload`
  (Perl — mojolicious/xslate), and `barefoot_js/dev_reload.rb` (Ruby —
  sinatra/rails). When those adapters' `build:watch` moved to `vite dev`,
  nothing wrote the sentinel any more — the backend process kept picking up
  fresh templates on every request (dev-mode template caching was already
  off), but the open browser tab was never told to reload, so an edit only
  showed up after a manual refresh.

  `barefoot()`'s dev pass now writes a fresh timestamp to
  `devSentinelPath(templatesDir)` — one directory above `templates`, matching
  `packages/cli/src/lib/build.ts`'s `DEV_SENTINEL_SUBDIR`/
  `DEV_SENTINEL_FILENAME` under `outDir` (every adapter following that
  layout nests `templates` as a direct child of `outDir`, so the two
  locations coincide) — on the initial pass and every subsequent rebuild,
  mirroring the `.barefootjs-dev-build` marker's existing write lifecycle.
  `writeBundle` (`vite build`) removes it, so a production build never
  leaves a stale dev sentinel for a still-running dev backend to trip over.

  Written unconditionally whenever `templates` is configured — no new
  plugin option. Hono's own dev-reload story doesn't consume this file at
  all (Cloudflare Workers detect a Worker-isolate restart directly via
  `dev-worker.ts`'s boot id over the same SSE endpoint), so the write is
  inert there.

  Verified end-to-end (`vite dev` + the backend's own dev command, editing
  `integrations/shared/components/Counter.tsx`) against `integrations/echo`
  and `integrations/mojolicious`, restoring their documented dev flow with
  zero changes to either integration or their Go/Perl runtime packages.

- 5b05b4b: Fix `./vite` entry points crashing on Node versions without native TypeScript stripping

  Every adapter's `./vite` subpath (and `@barefootjs/vite`'s own `.` entry)
  pointed at `.ts` source, e.g. `{"types": "./src/vite.ts", "import":
"./src/vite.ts"}`. That copied the shape of `./build` — which is only ever
  loaded by `bf build` running under bun, a runtime that reads `.ts`
  natively — but Vite's own config loader is a different kind of consumer:
  it externalizes bare imports like `import { barefoot } from
'@barefootjs/hono/vite'` and lets **Node**, not bun, resolve and load them.
  This only ever worked in a container whose Node happens to have native
  type-stripping on by default (22.18+); on any older Node it fails with
  `TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts"` the
  moment a downstream app's `vite.config.ts` does `import { barefoot } from
'@barefootjs/<adapter>/vite'`.

  Fix, per package:

  - Every `./vite` subpath (`@barefootjs/blade`, `@barefootjs/erb`,
    `@barefootjs/go-template`, `@barefootjs/hono`, `@barefootjs/jinja`,
    `@barefootjs/mojolicious`, `@barefootjs/rust`, `@barefootjs/twig`,
    `@barefootjs/xslate`) now SPLITS its two conditions instead of pointing
    both at the same file: `{"types": "./src/vite.ts", "import":
"./dist/vite.js"}`. TypeScript reads `types`, Node reads `import` — they
    never had to be the same file, and keeping `types` on real source means
    every consumer that only ever needed to _type-check_ against this entry
    (an adapter's own `build:types`, a downstream app's `tsc`) keeps doing so
    straight from source, with nothing built, exactly as before. Only the
    condition Node's ESM loader actually resolves (`import`) needs to be
    built JS. `publishConfig` is untouched — it already swapped both
    conditions to `dist` at pack time, which is correct: nothing outside
    this workspace should type-check against source.
  - `@barefootjs/vite`'s own `.` entry gets the same split (top-level `types`
    → `./src/index.ts`, `import` → `./dist/index.js`; `publishConfig` keeps
    swapping both to dist at pack time, restored to its original shape).
  - Each adapter's `build:js` now bundles `src/vite.ts` in its own `bun
build` invocation, separate from the `index.ts`/`adapter/index.ts`/
    `build.ts` invocation those subpaths keep sharing. The `./vite` build
    does NOT externalize `@barefootjs/jsx` / `@barefootjs/shared` — Node
    would otherwise hit the exact same `.ts`-extension failure one hop
    later, resolving `@barefootjs/jsx`'s own (still src-pointing, unchanged)
    `.` export. `@barefootjs/vite`'s own build drops the same two externals
    for the same reason. Both keep `typescript` external (a real npm
    package, already Node-loadable) to avoid bundling the whole TS compiler
    into every adapter's `./vite` output.
  - `--target node` on both of the above: bun's default bundle target is
    `browser`, which polyfills `node:fs/promises` et al. into browser stubs
    — silently turning every `readFile`/`writeFile`/`mkdir` call into
    `undefined` at runtime (`TypeError: readFile is not a function`) instead
    of failing to build. Only surfaces once something (Vite's config loader)
    actually calls the plugin's manifest-reading code, so it hid behind the
    same "nothing loads dist under Node" gap as the `.ts`-extension bug.
  - `@barefootjs/client`'s `./build` entry (already dist-only on both
    conditions, unchanged by this PR — its consumers always needed it
    built) had the identical latent runtime bug one level removed:
    `CSRAdapter` (`csr-adapter.ts`) imports `BaseAdapter` from
    `@barefootjs/jsx` as a real value, and `build:js` externalized it — so
    `integrations/csr`'s `vite.config.ts` (`import { CSRAdapter } from
'@barefootjs/client/build'`) hit the same crash one hop further down the
    chain. Fixed the same way: stop externalizing `@barefootjs/jsx`, add
    `--target node`.
  - Root `build` script keeps `@barefootjs/vite` as an explicit early build
    step, before the `@barefootjs/hono` / `@barefootjs/go-template` /
    `@barefootjs/mojolicious` trio and the rest of `--filter '*'`. This is
    NOT for type resolution (the `types`/`import` split above already
    decouples that from build order — a scoped `build:types` run, e.g. `cd
packages/blade && bun run build`, never needs `@barefootjs/vite` built).
    It's for the RUNTIME resolution real `vite build`/`vite dev` invocations
    need: `--filter '*'` does not reliably build `@barefootjs/vite` before
    workspace packages whose OWN build step actually executes a Vite config
    that imports it (`integrations/nethttp`, `integrations/chi`, and any
    other integration whose `build` script runs `vite build` for real, not
    just type-checks) — confirmed by dropping this step and watching a
    clean `bun run build` fail with `ERR_MODULE_NOT_FOUND` resolving
    `@barefootjs/vite/dist/index.js` from `adapter-go-template/dist/vite.js`
    partway through `--filter '*'`.
  - `packages/vite/tsconfig.json` gains `DOM`/`DOM.Iterable` lib entries
    (every sibling adapter tsconfig already had them) — still needed
    independent of the above: `packages/vite`'s OWN `build:types` walks real
    (non-type-only) imports from `@barefootjs/jsx`, whose `html-types.ts`
    needs DOM lib to resolve `HTMLButtonElement` and friends. Confirmed by
    reverting just this file and rebuilding — `tsgo` fails the same way
    whether or not the root build ordering or the `types`/`import` split are
    in place.

  **DX cost**: every one of these packages' `./vite` (or `@barefootjs/vite`'s
  `.`) entry now needs `bun run build` before `vite dev` / `vite build` can
  actually load and run it — the `import` condition was always meant to be a
  build artifact, this just stops it accidentally working off raw source.
  Type-checking (`tsc`/`tsgo` against the `types` condition) needs no build
  step at all, in any of these packages, scoped or full — that's the whole
  point of the split. Running an integration's `vite dev`/`vite build`
  without building workspace packages first fails the same
  `ERR_UNKNOWN_FILE_EXTENSION` / `ERR_MODULE_NOT_FOUND` way it always would
  have on a stricter Node; the fix removes the accidental "works because
  dist happens to already exist from an unrelated build" case rather than
  adding a new requirement.

  Backstop: `__tests__/vite-entry-node-loadable.test.ts` reads every
  workspace package's manifest and fails if any `./vite` (or
  `@barefootjs/vite`'s `.`) export's `import`/`default` condition — the ones
  Node's ESM loader itself resolves — points at raw `.ts` source. `types` is
  deliberately exempt (see above); a `.d.ts` declaration file is fine on
  either condition. A future adapter that copies the old fully-`.ts`-pointing
  shape, or that regresses `import` back onto source, fails loudly here
  instead of silently depending on a new-enough Node.

- a3760e8: Fix `rewriteRelativeImport` re-anchoring for a `components` dir outside the Vite root

  `plugin.ts`'s `rewriterFor` guessed a compiled component's on-disk output
  path using a ROOT-relative path (`toPosixRelative(resolvedConfig.root,
absPath)`), but `planEmits` (the code that actually decides where a
  template lands) mirrors it relative to WHICHEVER configured `components`
  dir contains it (`relativeUnderComponentDir`) — the same helper
  `safeRollupEntryName` already uses for the analogous Rollup-entry-naming
  problem. The two guesses coincide only when every configured `components`
  dir IS the Vite root; this repo's real layouts commonly configure a
  `components` dir that's a SIBLING of root instead (e.g.
  `integrations/hono`'s `../shared/blog`), where `planEmits` flattens the
  file directly under `templatesDir` with no extra path segment preserved.

  The root-relative guess computed a phantom nested output path for such a
  file, corrupting the relative-import rewrite for any file it shares a
  directory with: a source-correct `import { Sidekick } from './Sidekick'`
  came out re-anchored to a broken `../shared/blog/Sidekick`-shaped
  specifier that doesn't resolve once both files land flat under
  `templatesDir`.

  Only exercised by an adapter whose templates carry real `import` syntax
  (Hono-shaped JS-runtime adapters — Go/Mojo/etc. templates have no import
  syntax and never call this at all), which is why it went uncaught through
  PR01-04: none of those PRs' fixtures had a JS-runtime adapter's client
  component importing a same-directory sibling from a non-root `components`
  dir. First caught building `integrations/hono`'s real Vite migration
  (`PageShell.tsx` → `./ReaderToolbar` in `../shared/blog`).

  - @barefootjs/shared@0.31.0
