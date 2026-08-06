# @barefootjs/hono

## 0.31.1

### Patch Changes

- 6c02777: `wrapWithInlineScripts` now declares its return type as `JSX.Element`
  instead of leaking `unknown`. Every compiled template returns this call
  as its component body, so the `unknown` return made every island fail
  TS2786 ("cannot be used as a JSX component") in any consumer app that
  type-checks its compiled templates. Type-only — no emitted-JS change.

## 0.31.0

### Minor Changes

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

- 844ce9c: Remove the externals-importmap subsystem — `renderImportMapHtml`, `BfImportMap`, `TemplateAdapter.importMapInjection`

  `BfImportMap`'s built-in default mapped `@barefootjs/client` to
  `<base>/barefoot.js`. After the Vite migration no `barefoot.js` exists in
  any build output — the runtime is a content-hashed shared ESM chunk — so
  the component's default output pointed at a URL that never existed. It had
  zero production callers, and `renderImportMapHtml` had exactly one caller
  (`BfImportMap`) besides its own contract test. Every importmap the repo
  actually emits (`site/core/renderer.tsx`, `site/ui/renderer.tsx`, the CSR
  and xyflow docs examples) is, and always was, hand-written — this subsystem
  was dead weight pointing at broken output.

  This is a **breaking** change, bumped as a MINOR, not a major: BarefootJS is
  pre-1.0 (0.31.x), where a minor is the breaking-change slot under semver's
  §4, and 1.0 is a stability commitment this release does not make.

  ## Removed

  - **`@barefootjs/jsx`**: `renderImportMapHtml`, `ImportMapManifest`,
    `ExternalsManifest`, and the `./import-map` export subpath.
    `TemplateAdapter.importMapInjection`.
  - **`@barefootjs/hono`**: `BfImportMap` and `BfImportMapProps` from
    `@barefootjs/hono/app`. `BfScripts` and `BfDevReload` are unaffected.
  - **`importMapInjection` declarations** on every adapter that had one:
    blade, erb, go-template, hono, jinja, mojolicious, rust, twig, xslate.
    None of them read the field — only the adapter-tests contract test
    (also removed) did.

  ## Corrected alongside it

  `@barefootjs/router`'s `defaultRehydrate` / `defaultDispose` keep
  `'@barefootjs/client/runtime'` in a _variable_ so bundlers cannot resolve it —
  that is what keeps the client runtime an optional peer for a static-shell
  site. The comment there said the browser resolves it "through the page's
  import map", and the error message told users to make sure the runtime was
  "mapped in the page's import map". Neither is actionable: nothing emits such
  a map, and `BfImportMap` would have mapped that specifier to
  `<base>/barefoot.js`, which does not exist. The fallback is unreachable in a
  correctly-wired app anyway — `setupStreaming()` installs the
  `__bf_hydrate_within` / `__bf_dispose_within` seams the code checks first.
  The message now names that call instead.

  ## What to do instead

  An app that deliberately externalizes a dependency
  (`build.rollupOptions.external`) and loads it from a CDN hand-writes its
  own `<script type="importmap">`, the same way every importmap this repo
  actually ships already does. See `docs/core/advanced/xyflow-browser-bundle.md`
  for a worked example, including the two correctness rules that used to live
  only in the deleted `renderImportMapHtml` (escaping `<` inside the importmap
  JSON; `crossorigin` on a cross-origin `modulepreload`) — both now documented
  there, where the hand-written pattern is actually taught.

- 122ac0e: `@barefootjs/hono/vite`, and `HonoAdapter` accepts `AdapterGenerateOptions.scriptAssets`

  Hono was the one adapter PR01's `scriptAssets` rollout skipped: its
  `generate()` ignores every script-related `AdapterGenerateOptions` field
  outright, because script URLs are resolved at REQUEST time, not codegen
  time — `build.ts`'s `addScriptCollection` post-processes the whole
  compiled file with a regex/paren-counting rewrite to inject a
  request-context script collector (`useRequestContext().set('bfCollectedScripts', …)`),
  and the runtime `BfScripts` component renders the collected tags at body
  end (necessary for Suspense/streaming — a script tag emitted inline at a
  component's own position would ship before that component's siblings
  finish streaming).

  That collector pattern turns out to be exactly what `GoTemplateAdapter`
  already does with `scriptAssets` — `.Scripts.Register "…"` calls, collected
  into a request/render-scoped set and flushed together — just expressed as
  Go template directives instead of TS statements. So `scriptAssets` fits
  Hono after all, expressed as CODEGEN instead of a post-hoc file rewrite:

  - `HonoAdapter.generate()` now bakes `registerComponentScripts([...urls])`
    as the first statement of a resolved component's function body when
    `options.scriptAssets` is non-empty, and wraps every `return (...)` the
    function can reach (including both branches of an if-statement early
    return) with `wrapWithInlineScripts(..., __bfInlineScripts)` — two new
    exports from `@barefootjs/hono/scripts` that replace `addScriptCollection`'s
    injected `__bfWrap` helper and try/catch block with one shared,
    non-duplicated function pair. `undefined` (the legacy `bf build` +
    `transformMarkedTemplate` path) and `[]` (resolved, but nothing to
    register) both emit no scriptAssets-driven codegen at all — purely
    additive, existing `createConfig`/`addScriptCollection` callers keep
    byte-identical output.
  - Under Vite, `scriptAssets` never includes a separate `barefoot.js`
    runtime registration: the `@barefootjs/client` runtime arrives as a
    shared ESM chunk the resolved entry already imports, which the browser
    follows on its own.

  ## `@barefootjs/hono/vite`

  A new subpath exporting `barefoot` (named AND default, matching core's own
  `packages/vite/src/index.ts` and `@barefootjs/go-template/vite`'s shape):

  ```ts
  import { barefoot } from "@barefootjs/hono/vite";

  export default defineConfig({
    base: "/static/components/",
    build: { outDir: "dist/static/components" },
    plugins: barefoot({
      components: ["src/components"],
      templates: "dist/components",
    }),
  });
  ```

  No `adapter` option — this constructs `HonoAdapter` itself. Unlike
  `@barefootjs/go-template/vite`, this needs no `afterEmit`-driven
  combination step: Hono's SSR marked template is already a complete,
  self-contained `.tsx` file (its own imports, types inlined) that
  wrangler/bun's own bundler compiles directly, with nothing across files to
  stitch together the way Go's `components.go` needs.

  It DOES need the same `assets` (+ `assetsOutputFile`, default
  `dist/bf-assets.ts`) option as `@barefootjs/go-template/vite`, for the same
  reason: a hand-written, non-component script entry (`integrations/hono`'s
  `client/router-entry.ts`, booting `@barefootjs/router`) isn't a `.tsx`
  component, so core's discovery/`scriptAssets` machinery never sees it, but
  a plain `.tsx` SSR file still needs its bundled URL. Generates a small TS
  module (`export const Assets: Record<string, string> = {...}`) the SSR
  file `import`s — the TypeScript analogue of `@barefootjs/go-template/vite`'s
  generated `bf_assets.go`.

  ## `integrations/hono` migrated to Vite (first JS-backed proof)

  The first JS-backed BarefootJS app on `@barefootjs/vite` — gin (previous
  PR) proved the design against a non-JS backend; this is the opposite case,
  where the SSR runtime and the client runtime are the SAME language and
  COULD share a module instance by accident if the design's "single ESM
  import graph" claim were wrong.

  Two hand-rolled workarounds this migration set out to verify are deletable
  turned out to split one-for-one and one-for-none:

  - **The `@barefootjs/client*` → `barefoot.js` import map** (`renderer.tsx`
    AND `blog.tsx` each had their own copy) is DELETED, matching gin's
    `blog.go` result: Rollup folds every bundled entry's `@barefootjs/client*`
    import into one shared chunk, so the browser needs no specifier
    redirection to get a single reactive runtime instance. Proven the same
    way gin's was — by deleting it and keeping the E2E suite green.
  - **`BfDevReload` / the `/_bf/reload` SSE endpoint is KEPT, not deleted.**
    It does not overlap with Vite's own dev websocket: `vite dev` and
    `wrangler dev` are two independent processes. Vite's socket only signals
    "a CLIENT bundle changed" (the URLs baked into a page via
    `registerComponentScripts`); it has no visibility into wrangler
    restarting the Worker isolate for a SERVER-side `.tsx` edit. The SSE
    boot-id reconnection protocol is what detects THAT half, which nothing
    in this design replaces.

  One CORE `@barefootjs/vite` bug found and fixed along the way (own
  changeset, `vite-relative-import-rewrite-fix.md`): `rewriterFor`'s
  output-path guess for re-anchoring a relative import was root-relative
  instead of component-dir-relative, producing a broken specifier for any
  component importing a same-directory sibling out of a `components` dir
  that isn't the Vite root (`../shared/blog`'s `PageShell.tsx` → `./ReaderToolbar`).
  Only a JS-runtime adapter's real `import` syntax exercises this at all —
  invisible to gin (Go templates have no imports) and to PR01-03's fixtures.

  `vite.config.ts` replaces the `build`/`build:watch` scripts (matching
  `integrations/gin`, `barefoot.config.ts` itself stays, unused, until PR07
  removes the legacy CLI). `scripts/assemble-public.ts` (Cloudflare Workers
  Assets) is updated for the new split layout: `templates: 'dist/components'`
  (unchanged — `tsconfig.json`'s `@/components/*` alias still points there)
  versus `build.outDir: 'dist/static/components'` (Vite's hashed client
  output, now copied recursively since Vite nests output under its own
  `assets/` subdirectory, unlike the legacy CLI's flat layout).
  `integrations/hono`'s Playwright E2E suite passes end-to-end against the
  migrated build.

- c92097b: Remove the legacy build pipeline — `bf build`, `barefoot.config.ts`, and every adapter's `createConfig`

  The last PR of the Vite migration (7a resolved `bf`'s project config from
  `vite.config.ts`; 7b made every scaffold emit `vite.config.ts`). All
  nineteen integrations run on `@barefootjs/vite`, and nothing depends on the
  second implementation any more — this deletes it.

  This is a **breaking** change, shipped as one release with the rest of the
  migration. It is bumped as a MINOR, not a major: BarefootJS is pre-1.0
  (0.30.x), where a minor is the breaking-change slot under semver's §4, and
  1.0 is a stability commitment this release does not make. Read the "Removed"
  and "Moved" sections below as the upgrade checklist regardless of the
  version digit that moves.

  ## Removed

  - **`bf build` and `bf build --watch`** — the CLI command, its arg parsing,
    and its `--help` listing are gone. Compile through `vite build` /
    `vite dev` via `@barefootjs/vite`'s `barefoot()` plugin instead.
  - **`packages/cli/src/lib/build.ts`** (2469 lines) and everything that
    existed only to serve it: `runtime-treeshake.ts`, `build-cache.ts`,
    `emit-ledger.ts`, `config-loader.ts`, `assets-ignore.ts`. `resolve-imports.ts`
    is the one file on the original removal list that turned out to still be
    load-bearing — see "What surfaced" below — it stays.
  - **`barefoot.config.ts`** as a config source. `bf`'s project-context
    resolution (`context.ts`) now reads `vite.config.ts` only; the
    `barefoot.config.ts` fallback branch added in 7a (for a transition period
    where both files could exist) is pruned along with the types
    (`BarefootBuildConfig`, `defineConfig`) that only served it. The 19
    `integrations/*/barefoot.config.ts` files — unused since 7b, kept only so
    this PR could delete them cleanly — are gone.
  - **Every adapter's `createConfig` factory and `./build` export subpath**
    (`@barefootjs/hono/build`, `@barefootjs/go-template/build`, and the
    blade/erb/jinja/mojolicious/rust/twig/xslate/client equivalents). Configure
    the Vite plugin directly instead: `import { barefoot } from
'@barefootjs/<adapter>/vite'` in `vite.config.ts`.
  - **`@barefootjs/hono/dev`** (`dev.tsx`) — dead since `dev-worker.ts`
    superseded it; imported only by its own test.
  - **`addScriptCollection`** (Hono's regex/paren-counting rewrite of
    compiled TS, forbidden by CLAUDE.md's parsing convention) — superseded by
    `scriptAssets` codegen (#2509).

  ## Moved

  - **`CSRAdapter`** moves from `@barefootjs/client/build` to
    `@barefootjs/client/csr-adapter` — the adapter class itself was never
    legacy-pipeline-specific (it's the `TemplateAdapter` every CSR
    `vite.config.ts` passes to `barefoot({ adapter: new CSRAdapter() })`);
    only `createConfig`, which lived in the same file, was.
  - **Go's type-combination helpers** (`combineGoTypes`, `deduplicateGoTypes`,
    `stripGoPackageHeader`) move from `@barefootjs/go-template/build` to a new
    internal `go-types.ts` — still wired into `components.go` generation via
    `@barefootjs/go-template/vite`'s `afterEmit` hook, unchanged behavior.

  ## What surfaced

  Latent dependencies on the "second implementation," found by deleting and
  following the breakage rather than guessing:

  - **`packages/cli/src/lib/resolve-imports.ts` looked build-only and wasn't.**
    `site/ui/build.ts` and `site/core/build.ts` — the component-registry and
    marketing/docs sites' own hand-rolled compiler-invocation scripts, which
    predate the Vite migration and were never in its scope — call
    `resolveRelativeImports` directly to inline sibling `.ts` helper modules
    into their compiled client JS. It stays, now genuinely used only by those
    two site scripts (`bf build` itself is gone).
  - **The same two site scripts also imported `hasUseClientDirective`,
    `discoverComponentFiles`, `generateHash` from the deleted `build.ts`, and
    `addScriptCollection` from the deleted Hono `build.ts`.** These four are
    pure text/text-discovery helpers with no other live caller post-migration
    — copied to a new `site/shared/lib/site-build-helpers.ts` rather than
    resurrected as shared CLI/adapter infrastructure.
  - **The BarefootJS benchmark app** (`benchmarks/apps/barefoot/`, gated into
    CI by `.github/workflows/benchmark.yml` on `packages/client/**` /
    `benchmarks/**` changes) spawned `bf build` directly against its own
    `barefoot.config.ts`. Migrated to a `vite.config.ts` mirroring
    `integrations/csr`'s own CSR setup; `build.ts` now shells out to `vite
build` instead.

  ## Verified

  - Full-repo `bun run build` and `bun scripts/smoke-publish.mjs` (packs every
    publishable tarball, scaffolds a project from them with no workspace
    refs, and runs the full `bf` CLI surface plus `npm run build` / `npm test`
    against it) green.
  - `gin` (Go), `hono` (JS/Cloudflare Workers), and `csr` built explicitly
    (`bun run build`, since not every `playwright.config.ts` builds for you)
    with their E2E suites green: `gin` 104/104, `hono` 105/105, `csr` 78/79
    (the one failure — `ToggleItem` ScopeID format — is pre-existing and
    unrelated to this PR, reproduced identically against the legacy build
    per the CSR migration's own changeset).
  - Per-package `bun test`: `cli` 729/729, `client` 625/625, `go-template`
    1545/1545 (19 skipped — needs `GOTOOLCHAIN=go1.25.6` in this sandbox,
    which ships go1.24.7 by default), `hono` 1322/1323 (one 5s-timeout flake
    under concurrent load, passes in isolation), `blade` 1281/1281, `jinja`
    1260/1260 (21 skipped). `erb`'s 57 failures are a pre-existing sandbox
    gap (`LANG`/`LC_ALL` unset → Ruby's JSON parser defaults to US-ASCII,
    rejecting multibyte fixtures) — not introduced by this PR.
    `mojolicious`/`rust`/`twig`/`xslate` build clean; not run to completion
    given the identical, low-risk shape of their edits (package.json export
    removal + an orphaned `build.ts` deletion with no test file referencing
    it in any of the four) and the consistent clean/environment-only-failure
    pattern across the seven packages that were run to completion.

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

## 0.30.6

## 0.30.5

## 0.30.4

## 0.30.2

## 0.30.1

## 0.30.0

### Patch Changes

- d95eb19: Fix scope id derivation for a child component nested inside a dynamic loop row

  A component nested below a loop row root (e.g. `<li><Badge/></li>` inside
  `{rows().map(row => <li>…</li>)}`) now derives its `bf-s` scope id from
  `<parentScope>_<slot>`, matching the Hono reference, instead of getting a
  freshly randomized `Name_<id>` on every other adapter and on CSR. A row-root
  component (`{rows().map(row => <Row/>)}`) is unaffected — it keeps its own
  randomized id.

  The fix is IR-driven: a new `IRComponent.loopItemRoot` flag (set once, in the
  loop-IR builder, only on a DIRECT loop-body member) backs a single shared
  predicate, `derivesScopeFromSlot()`, that every backend now consults instead
  of a mutable "am I inside a loop" flag that couldn't distinguish a row root
  from a component nested below it. Hono's own `renderComponent` branch
  selector is refactored onto the same IR flag, so the policy is expressed once
  rather than approximated per adapter.

  On the client runtime, `createComponent`/`materializeComponent` now derives a
  slotted component's own scope id from its mount slot. (A companion fix in
  `renderChild` — pushing that derived scope while its template evaluates, so a
  THIRD composition level derives its own scope instead of collapsing onto the
  second — was tried but reverted: it collided with `comment: true` wrapper
  transparency, e.g. a `renderNode`-style callback prop, whenever the wrapped
  component's own first slot id coincides with the wrapper's slot number.
  `grandchild-composition` stays a known limitation.)

  Since a slotted child was previously unreachable by the primary
  `(bf-h, bf-m)` SSR-scope lookup on every non-Hono adapter, this also fixes a
  latent SSR-hydration bug: such a child was silently never initialized on the
  client.

  Graduates the `composite-row-child-component` conformance fixture (still
  skipped on Go — that adapter's divergence is a different failure, tracked in
  #2445) and the `composite-row-child-component` CSR conformance skip.

  Fixes https://github.com/piconic-ai/barefootjs/issues/2444.

- b4f5075: Fix the Hono adapter dropping a renamed destructured prop's caller-facing key (#2460)

  `function Badge({ text, n: count }: { text: string; n: number })` — the
  caller passes `n`, the body reads the local binding `count`. The Hono
  adapter built its SSR props destructure keyed by `ParamInfo.name` (the
  LOCAL binding) instead of `sourceName ?? name` (the CALLER-facing key —
  `ParamInfo.sourceName`'s own documented rule), so the emitted function
  read a `count` property the caller never passed:

  ```tsx
  // before (wrong): reads a `count` prop that doesn't exist on the caller's object
  export function Badge({ text, count, __instanceId, ... }: BadgePropsWithHydration) { ... }
  // after: keeps the rename
  export function Badge({ text, n: count, __instanceId, ... }: BadgePropsWithHydration) { ... }
  ```

  `count` was therefore always `undefined`, with zero diagnostics. The fix
  emits the plain shorthand when the caller-facing key matches the local
  binding (byte-identical output for every existing, un-aliased component)
  and a `key: local` rename otherwise — including a destructuring default
  (`{ n: count = 7 }` → `n: count = 7`) and a non-identifier caller key
  (quoted, e.g. `"data-key": local`). This also fixes the dead `class` →
  `className` special case: the only way a `class`-named caller prop can
  reach a destructured component is via an explicit alias
  (`{ class: className }`, since `class` can never be an un-aliased
  binding identifier), which now correctly emits the rename `class:
className` instead of a bare `className`.

  `@barefootjs/jsx`'s `extractSsrDefaults` (the template-stash adapters'
  SSR-seed extractor) had the mirror-image bug: `propName` — the field the
  Perl/PHP/etc. manifest consumer reads the CALLER's props by
  (`$props->{propName}`) — was set to the local binding instead of
  `sourceName ?? name`, so a renamed prop's SSR seed silently fell back to
  `null` instead of the caller's value.

  The sibling keyings audited in the same pass (props-to-serialize
  filtering, the `__hydrateProps` hydration-blob assembly) were already
  consistent — both sides key by the LOCAL binding, matching what the
  generated client init function reads (`_p.<localName>`) — so they needed
  no change.

  Verified end-to-end through Hono (`renderHonoComponent`): aliased with no
  default, aliased with a default (both caller-omitted and
  caller-overridden), the un-aliased case (byte-identical destructure
  text), the `class` rename, and the hydration-serialization path (the
  `bf-p` blob carries the correct value under the local key that
  `initBadge`'s `const count = _p.count` extraction reads).

  Adds the composite-loop-row fixture #2457 (fixed on the Go side, #2462)
  was blocked on: an aliased destructured prop on a child component inside
  a keyed `.map()` row, with distinct per-row values. Verified passing on
  Hono and ERB; expected to pass on Go per #2462's fix (not run here per
  this change's scope — Go/CI will confirm). Skipped with a pointer back
  to #2460 on Blade, Jinja, Mojolicious, Twig, Xslate, and minijinja/Rust,
  which still key the caller-facing lookup by the local binding for a
  standalone aliased prop — verified failing on all six before adding the
  skip.

## 0.29.0

## 0.28.1

## 0.28.0

### Patch Changes

- bb32b16: Fix the Hono adapter dropping a conditional branch's own `bf:sN` slot
  marker, the only renderer among erb/jinja/go-template/mojolicious/hono to do
  so.

  `loop-branch-stale-text` (previous changeset) gave a keyed `.map()` row's
  bare-expression conditional branch (`task.done ? task.label : 'pending'`)
  its own `slotId` so a per-item update effect can rewrite it without the
  outer conditional re-evaluating. `irToHtmlTemplate` renders that marker
  identically into the CSR/hydration template and every marked-template
  adapter (erb: `bf.text_start("s1")`…`bf.text_end`; jinja/go-template:
  `bfTextStart "s1"`…`bfTextEnd`; mojolicious: `bf->text_start("s1")`…
  `bf->text_end`). The Hono adapter renders conditional branches through a
  separate path (`renderNodeRawCtx`/`wrapWithCondMarker` in
  `hono-adapter.ts`) that bypassed `renderExpression` entirely for expression
  nodes, so it never looked at the branch's `slotId` and emitted no marker at
  all — just `{bfComment("cond-start:s0")}{task.label}{bfComment("cond-end:s0")}`.

  Measured consequence: claiming that Hono-shaped branch HTML with
  `lazySlots(branchScope, [{ id: 's1', kind: 'markup', path: [] }])` and
  writing to it warned twice (`slot s1 marker not found; skipping`, `no
claimed slot for id s1; write ignored`) and left the DOM unchanged. A
  Hono-server-rendered row hitting this exact shape stayed stale until its
  first condition flip.

  Fix: `wrapWithCondMarker`'s expression-node branch now checks the node's
  own `slotId` and, when present, wraps the content in `{bfText(id)}`…
  `{bfTextEnd()}` INSIDE the outer `cond-start`/`cond-end` pair — matching
  every other adapter's marker structure byte-for-byte. A branch with no
  `slotId` (a plain string literal, e.g. `conditional-wrapping-loop`'s
  `'[x]'`/`'[ ]'`) gets no inner marker, unchanged. The existing
  `bfText`/`bfComment`/`bfTextEnd` utility-import detection already scans the
  generated code by identifier, so no import-list change was needed.

  After the fix, claiming the same branch HTML updates the DOM
  (`<!--bf:s1-->CCC<!--/-->`) with no warnings.

  `loop-item-ternary-bare-branch`'s `expectedHtml` (adapter conformance
  fixture) gains the inner `<!--bf:s1-->Write it<!--/-->` marker inside the
  outer `bf-cond-start:s0`/`bf-cond-end:s0` pair — the only byte change
  anywhere in the SSR/CSR conformance suites, since the earlier PR's
  CI-generated regeneration had (wrongly) captured Hono's marker-omitting
  output as the expected shape.

## 0.27.0

## 0.26.4

## 0.26.3

### Patch Changes

- 8b8e2f6: Unify flatMap callbacks onto the structured-segments carrier — the `__BF_JSX_N__` sentinel ceases to exist.

  `FlatMapCallback` was the last user of the sentinel-string mechanism (body text with `__BF_JSX_N__` placeholders, substitution duplicated per emitter). It now carries the same structure as `.map()` preambles — js-text / compiled-JSX-leaf segments rendered through the single `renderPreamble()` door, plus `TsxSourceText`-branded raw TSX for JSX-runtime SSR — so the placeholder concept (and its user-string collision hazard and per-emitter `String.replace` fragility) is gone from the compiler entirely. Riding the shared machinery brings three behavior fixes to flatMap block bodies: leaf text interpolations now escape like the SSR JSX runtime, TypeScript type annotations in the body are now stripped from the client bundle (previously spliced raw), and a JSX leaf inside a template literal is refused explicitly. These are pinned at the compiler-unit level (`flatmap-segments.test.ts`); a byte-parity conformance fixture is deliberately deferred — the flatMap CSR string render has pre-existing structural asymmetries against the Hono rawBody SSR path (client-only leaf `data-key` with an unescaped attribute value, client-only slot markers) tracked as a known limitation in #2384. Analysis walkers (`attachParsedExpressions`, loop-bound names, rich-type refusal) now also visit `.map()`-preamble leaf IR, closing an analysis-coverage gap. A test-gated `getJS` trust-boundary assertion (armed by the trichotomy harness) makes any future "raw JSX spliced into output on an error-free compile" throw at the source instead of leaking.

- 9aae7b1: Root-cure the `.map()` callback-preamble pipeline (Stage 3 of `spec/callback-fidelity.md`).

  The preamble was carried as sentinel-bearing strings (`mapPreamble` + `__BF_JSX_N__` placeholders) whose substitution obligations were spread across every loop emitter — each unwired emitter silently leaked raw JSX or sentinels into the client bundle. Probing found five such silent holes (bare-identifier return, multi-root fragment return, ternary return after a builder preamble, nested inner map, conditional-branch loop). The carrier is now a structured type: `MapCallbackPreamble` segments (JS text / compiled JSX-leaf IR) plus `TsxSourceText`-branded raw TSX for JSX-runtime SSR, rendered exclusively through `renderPreamble()` — a consumer that can't call it cannot splice the preamble, so a missing wire-up is a type error, not a runtime leak.

  All five holes are closed: the migration itself healed multi-root, nested-inner-map, and branch-loop (nested verified to full parity — array-builder bodies now render inside nested maps and conditional branches); a Phase-1 acceptance guard refuses the return shapes that have no element root (`return out`, ternaries) with restructuring guidance; a builder feeding a component root is refused (the component would receive HTML strings client-side but JSX elements at SSR); and every loop plan variant now declares its row-construction capability (`rowConstruction`), with a dispatcher backstop so a future variant cannot silently drop a preamble. Leaf text interpolations now escape like the SSR JSX runtime (`escapeText` applied once at the `renderPreamble` door; `map-array-builder-escaping` fixture pins byte parity). The `{out}` array-join is scoped precisely to leaf-accumulating locals, fixing a spurious join on value-only locals. The no-silent-divergence invariant is executable (`map-body-no-silent-divergence.test.ts`): every `.map()` body shape must compile sound or refuse loudly, and the known-hole set is empty and shrink-only. A JSX leaf inside a template literal in a preamble is refused explicitly.

## 0.26.2

## 0.26.1

## 0.26.0

## 0.25.0

## 0.24.1

## 0.24.0

## 0.23.0

## 0.22.0

### Patch Changes

- fdc5b3e: Add `formatDate(date, pattern, timeZone)` (#2324): a pure-function date formatter with explicit inputs — pattern tokens `YYYY`/`MM`/`M`/`DD`/`D`, timezone `'UTC'` or a fixed `±HH:MM` offset — exported from `@barefootjs/client` and catalogued as the backend-neutral `format_date` template helper. SSR adapters lower the call through the builtin lowering-plugin registry and render it natively on every backend (Go, Ruby, Perl, PHP, Python, Rust) with byte-identical, golden-vector-pinned output; no locale, timezone database, or ICU data is consulted anywhere.

## 0.21.4

## 0.21.3

## 0.21.2

## 0.21.1

## 0.21.0

### Patch Changes

- ea50cdc: Fix #2289: a fragment-rooted child component (`'use client'` component returning `<>…</>`) now hydrates with its parent's live props — callbacks and reactive getters included — instead of silently losing every function-valued prop.

  - `@barefootjs/client`: `$c` / `findSsrScopeBySlotIn` gain a comment-scope fallback (`findCommentChildScope`) that resolves a child declared by a `<!--bf-scope:<parentId>_<slotId>|h=…|m=…-->` marker, registers its proxy element, and hands it to `initChild` — so the child's init runs with the parent's real prop object rather than never running at all (the props JSON in the marker only ever carried the JSON-safe subset). `getCommentScopeBoundary` now honours a paired `<!--bf-/scope:<scopeId>-->` end marker so a fragment scope's queries stop at its real last root instead of leaking onto later parent-owned siblings (the reported misattached-aria symptom); HTML without the end marker falls back to the old heuristic.
  - `@barefootjs/shared`: new `BF_SCOPE_COMMENT_END_PREFIX` constant.
  - `@barefootjs/hono`, `@barefootjs/go-template`, `@barefootjs/erb`, `@barefootjs/jinja`, `@barefootjs/twig`, `@barefootjs/xslate`, `@barefootjs/mojolicious`, `@barefootjs/blade`, `@barefootjs/rust`, `@barefootjs/php`, `@barefootjs/perl`: fragment-rooted templates emit the paired `bf-/scope` end marker after the fragment's last root.
  - `@barefootjs/router`: region diffing normalizes the new end marker's volatile scope id.

## 0.20.0

### Patch Changes

- 35945c6: Fix #2273: refuse a method call on a prop typed as a built-in host rich type (`Date`, `Map`, `Set`, `URL`, …) with no catalogued lowering, instead of silently transliterating it into template syntax that dies at request time.

  `Date` props (and the other host rich types) previously lowered as an opaque passthrough: `createdAt.toISOString()` compiled cleanly and rendered correctly on Hono/CSR, but on the SSR text-template adapters transliterated verbatim into the target syntax (a Go template method-value panic, a Jinja `AttributeError`, …) — a failure only visible once someone actually rendered the page. `checkRichTypeMethodCalls` (`packages/jsx/src/rich-type-refusal.ts`) closes that gap at compile time: it walks every expression position the compiler already lowers into a template and refuses with BF021 as soon as a call's receiver is provably a host rich type (`Date`, `Map`, `Set`, `WeakMap`, `WeakSet`, `URL`, `URLSearchParams`, `RegExp`, `Promise`, `Error`, `Symbol`, `BigInt`, `Function`) with no catalogued lowering. Verified against the full 2500+-unit `packages/jsx` suite and the `ui/components` corpus with zero false positives — the refusal only fires when `rich-type-evidence.ts`'s type resolution can _prove_ the receiver's type from `propsType`/`typeDefinitions`; any receiver it can't prove a type for (signal getter results, untyped/generic receivers, computed access, …) is silently allowed through, matching the existing BF021 filter/sort-comparator refusal's conservative-by-construction design.

  Two exemptions keep the escape hatches intact:

  - `/* @client */` opts the expression out of SSR lowering, same as every other BF021 shape.
  - A call a registered lowering plugin claims (`lowering-registry.ts`, #2057) is exempt — cataloguing an individual rich-type API (e.g. `Date.prototype.toISOString`) is a plugin's job, not a change to this refusal. That catalogue is tracked separately as #2274.

  All nine adapters' `conformance-pins.ts` now pin the new `date-method-uncatalogued` fixture to `{ code: 'BF021', severity: 'error' }` — including Hono, since the refusal runs ahead of `adapter.generate()` and applies even to adapters whose own runtime could otherwise evaluate the call.

## 0.19.1

## 0.19.0

## 0.18.7

### Patch Changes

- fd73cf0: Perf: new `createSelector(source, fn?)` primitive (SolidJS-compatible, #2143 gap 5) — an O(changed) selection accessor for `class={isSelected(row.id) ? ... : ...}` patterns. Each row's effect subscribes to its own key instead of the raw signal, so a selection change re-runs two effects (deselected + selected row) regardless of list size. The returned accessor is `Reactive<>`-branded, so the existing type-based reactivity analysis recognises `isSelected(row.id)` with no analyzer changes beyond registering the export and a `needsTypeBasedDetection` trigger for bare selector usage outside `.map()`. `@barefootjs/hono` gains the matching SSR client-shim stub.

## 0.18.6

## 0.18.5

### Patch Changes

- 7bd1762: Decode JSX character references in Phase 1 and escape static content on emit. JSX defines `&copy;` in literal text (and in quoted attribute values) as the character `©` — Babel, esbuild, and TypeScript's JSX emit all decode at parse time — but the compiler carried the RAW source text through the IR, so every template adapter re-emitted the undecoded entity (`html-entity-text` divergence) and none escaped HTML metacharacters in static attribute values (`static-attr-escape`: `title="Fish & Chips"` reached the output unescaped). Phase 1 now decodes via the new `decodeEntities` (`@barefootjs/shared`; numeric references fully, named references from a curated table — unknown names degrade consistently on every backend), so `IRText.value` and static attribute values carry the semantics. Emission escapes per context: the eight template adapters and the client-JS `innerHTML` template builders route static text and attribute values through the shared `escapeHtml` (`& < > "`), and the Hono adapter re-encodes for JSX source (adding `{`/`}`). Both fixtures graduate from all eight adapters' `renderDivergences` declarations and from the CSR conformance skip list.
- 3779c8d: Fix `Object.entries(prop).map(([k, v]) => …)` (and `.keys()`/`.values()`) over an object-shaped prop — previously broken on all 8 template adapters (empty output, wrong keys, or a Go runtime crash).

  The compiler only recognized the array instance-method form (`arr.entries()`/`.keys()`/`.values()`, zero-arg property access) as an iteration-shape loop source — never the static method form `Object.entries(x)`/`.keys(x)`/`.values(x)` on a plain object (one argument, callee `Object.<method>`). Unrecognized, it silently parsed as a generic call and fell through every adapter's expression lowering treating the literal `Object` identifier as a bogus prop reference.

  - Added `IRLoop.objectIteration?: 'entries' | 'keys' | 'values'`, a shared IR field distinct from the existing array-only `iterationShape` (the object case's "index" is a string key, and the collection is a map/dict/hash, not an array/slice — a genuinely different lowering shape, not a variant of the array one). A new `isObjectIteratorCall` recognizer (mirroring the existing `isIteratorShapeCall`) strips the `Object.<method>(...)` wrapper in `transformMapCall`.
  - **Jinja / Twig / minijinja(Rust) / Blade**: lower straight to native map/dict iteration (Python `dict.items()`, PHP `foreach`, minijinja's `|items` filter) — these four preserve JS `Object.entries()`'s insertion-order semantics natively, verified per-language.
  - **Text::Xslate**: `.kv()`/`.keys()`/`.values()` Kolon methods — verified to give deterministic alphabetically-sorted order.
  - **Go**: needed no adapter code changes — the existing generic `{{range $k, $v := .Field}}` lowering already works, since Go's `range` is polymorphic over maps (sorted-by-key via the stdlib's own `fmtsort`).
  - **Mojolicious**: `sort keys %{$hash}`, mirroring the existing `sort keys` convention already used elsewhere in the shared Perl runtime for the same reason (hashes have no native order).
  - **Blade / Twig (PHP)**: added `entries()`/`keys()`/`values()` helper methods to the shared `@barefootjs/php` runtime (`BarefootJS.php`) — Twig's `{% for %}` can't iterate a plain `stdClass` (not `Traversable`); these do a defensive `(array)` cast, which preserves PHP's own insertion order.
  - Go, Rust, and Mojolicious/Xslate lower to a **deterministic sorted-by-key** iteration rather than true JS insertion order, which is physically unrecoverable from those languages' native map types once constructed — documented as a permanent known limitation on `IRLoop.objectIteration`'s docstring, not a follow-up.
  - Fixed a related client-JS regression this surfaced: an object-shaped loop source that happens to be a static module-scope const (e.g. `const chartConfig = {...}`) was previously miscategorized as a "static array" (which assumes a real array, calling `.forEach()`/`.map()` on it) — `isStaticArray` now excludes any `objectIteration`-shaped loop, routing it through the dynamic `mapArray()` reconciliation path instead, whose array-expression reconstruction (`applyObjectIterationWrap`) already handles it correctly.

  `object-entries-map` graduates from a render divergence to a passing render on all 8 adapters; `ui/compat.lock.json` and the divergence declarations are updated accordingly.

  Also fixed the SAME gap in `@barefootjs/hono` (the JSX/JS reference renderer used for `expectedHtml` generation and real Hono apps) — it re-emits real JS for SSR, so it needed the identical `Object.entries/keys/values(x)` reconstruction as the client-JS emitter, caught by its own conformance suite in CI.

## 0.18.4

### Patch Changes

- 23cc4dc: Normalize intrinsic-element attribute names ONCE in Phase 1: `IRAttribute.name` now carries the HTML/SVG attribute name, so every adapter emits it verbatim. The shared `dom-prop` classifier grows an `HTML_CAMEL_ALIASES` table (React-style camelCase → HTML: `tabIndex` → `tabindex`, `maxLength` → `maxlength`, `autoComplete` → `autocomplete`, `readOnly` → the boolean `readonly`, `spellCheck` → the enumerated `spellcheck`, …) consulted by both `toHTMLAttrName` (now applied in `jsx-to-ir`'s `processAttributes`) and `toHTMLAttrNameRuntime` (spread paths). Previously each adapter mapped at most `className` → `class` itself and every other alias leaked into the emitted HTML as an unknown attribute the browser ignores — `htmlFor` never became `for` (broken label association on template backends), `readOnly` rendered as `readOnly="true"` vs bare presence depending on backend, and SVG `strokeWidth`/`strokeLinecap` passed through unmapped. Component props (`IRProp`) keep the user's API names; unknown names (`data-*`, custom-element attributes, `viewBox`-style case-sensitive SVG XML names) pass through unchanged. The `camelcase-attributes`, `svg-icon`, and `boolean-attr-literals` fixtures graduate from every adapter's `renderDivergences` declaration and the CSR skip list.

## 0.18.3

## 0.18.2

## 0.18.1

## 0.18.0

### Patch Changes

- 6c13ce7: `@barefootjs/jsx` exports `ConformancePin` / `ConformancePins` types, and each adapter package now exports its conformance `expectedDiagnostics` pin set as a structured `conformancePins` module (with `issue:` URLs) consumed by its own conformance test. These structured pins also feed a repo-internal component × adapter compile-compatibility matrix (`ui/compat.lock.json`, regenerated with `bun run compat:lock` and drift-checked in CI) that is not part of the published CLI or any published package's runtime surface.

## 0.17.1

## 0.17.0

### Patch Changes

- f2189b4: Re-export `queryHref` (and its `QueryParams` / `QueryParamValue` types) from the Hono adapter's client shim (#2042).

  The shim resolves `@barefootjs/client` for the Hono SSR runtime; `queryHref` is a pure helper (no reactivity) that runs unchanged on the server, so it must be re-exported like `searchParams` / `splitProps`. Without it, rendering a component that imports `queryHref` failed at server start with `Export named 'queryHref' not found`. Completes the Hono side of the `queryHref` support added in #2044.

- c8c7d50: Recognize the `searchParams` env signal structurally via `createSearchParams()` (#2057, part 1).

  The request-scoped query env signal is now a `createSignal`-shaped factory the compiler recognizes by structure, removing the `searchParams` name allow-list from the compiler core:

  ```tsx
  // before
  import { searchParams } from "@barefootjs/client";
  searchParams().get("sort");

  // after
  import { createSearchParams } from "@barefootjs/client";
  const [searchParams, setSearchParams] = createSearchParams();
  searchParams().get("sort"); // reactive read
  setSearchParams({ sort: "price" }); // single imperative navigation path
  ```

  Because `searchParams` is now a real signal getter, it lands in the fold purity oracle and reactive-getter set structurally — the clean fix for the fold-oracle special-casing (superseding the reverted #2055) with no name allow-list.

  - `@barefootjs/client`: **breaking** — the bare `searchParams` export is replaced by `createSearchParams()`, which returns a `[getter, setter]` tuple. The getter is the request-scoped query reader (unchanged SSR + client resolution); `setSearchParams(next)` is the single imperative navigation path (soft same-route nav via the router seam, hard-nav fallback otherwise), replacing the confusing mutable-`URLSearchParams` write path. `SearchParamsInit` accepts a query string, `URLSearchParams`, or a record.
  - `@barefootjs/jsx`: `createSearchParams` is a recognized signal primitive tagged with an `envReader` key on `SignalInfo`; `CLIENT_EXPORTS` swaps `searchParams` for `createSearchParams`; env-signal recognition flows from IR structure, not import names. Codegen keeps env signals out of normal value/field emission while leaving them in the reactivity graph.
  - `@barefootjs/shared`: new `BF_SEAM_NAV_SEARCH` seam for imperative query navigation.
  - Adapters (`go-template`, `hono`, `mojolicious`, `xslate`): env-signal reader lowering keys off signal structure instead of the import name; the per-request reader binding (`bf.SearchParams` / `$searchParams`) is unchanged.

  Migration: replace `import { searchParams } from '@barefootjs/client'` + `searchParams()` with `import { createSearchParams } from '@barefootjs/client'` + `const [searchParams] = createSearchParams()`, and use `setSearchParams(...)` for imperative query navigation.

## 0.16.0

### Patch Changes

- a7c90a6: Honor `/* @client */` on attribute bindings (#1966).

  The inline directive deferred a JSX child/text expression to hydration but was silently ignored on attribute initializers: a Go-unsupported predicate in `data-x={/* @client */ pred(x)}` still got lowered and raised BF101/BF102, making the BF102 remediation misleading for attribute-only reactive state.

  The `clientOnly` flag was already set in the IR and honored by the client-JS reactive-attribute path (the CSR template omits the attribute and a mount effect sets/patches it on hydrate). The gap was in the adapters: `renderAttributes` lowered every attribute. All four adapters (Go, Mojo, Xslate, Hono) now skip SSR emission for `clientOnly` attributes, so the server omits the attribute, the unsupported-expression lowering is never reached, and the client sets it on hydrate.

## 0.15.2

## 0.15.1

## 0.15.0

### Minor Changes

- c6212ab: Request-scoped environment signals (`searchParams()`, and future cookies/…) now resolve at SSR for the non-Hono JS hosts that render via `renderToHtml` (h3 / Elysia / any WinterCG handler), through one **keyed** request-env mechanism. #1922 (follow-up to router v0.5).

  Hono resolves a request's environment through `useRequestContext()` inside its `jsxRenderer` async context; `renderToHtml` has none, so `searchParams()` previously resolved to the empty default regardless of the request — query-dependent initial content flashed / mismatched on hydration.

  - **`@barefootjs/client`**: the searchParams-specific server reader seam is generalised to a single keyed one. `__bfSetServerSearchReader` → `__bfSetServerEnvReader((key) => …)` and `globalThis.__bf_serverSearchReader` → `globalThis.__bf_serverEnvReader(key)` (`createEnvSignal` now takes the env `key`). One seam serves every env signal, so a new signal (cookies, …) needs no new seam, setter, or host function.
  - **`@barefootjs/hono`**: new `@barefootjs/hono/request-env` subpath. It scopes the request env with a Node `AsyncLocalStorage`, so each render reads its own request's values and concurrent renders never race (a process-wide per-request global would, which the spec forbids). It installs on the shared keyed `__bf_serverEnvReader` seam (no `@barefootjs/client` import) and delegates to any prior reader when no scope is active, so a process mixing Hono and `renderToHtml` hosts keeps resolving both ways, and it lives behind its own subpath so the always-on `renderToHtml` path never loads `node:async_hooks`. Two entry points:
    - `withRequestEnv(handler)` — wrap a WinterCG `fetch` handler once at the entry point. It derives the env from the `Request`, so the whole request runs with it bound and every `renderToHtml` inside resolves it with **no per-render plumbing**; the host never names env keys.
    - `runWithRequestEnv(env, fn)` + the keyed `BfRequestEnv` type — the lower-level primitive for hosts that bind env manually.

  Usage (the bundled h3 and Elysia demos are wired this way — bind once, pages are plain `renderToHtml`):

  ```ts
  import { withRequestEnv } from "@barefootjs/hono/request-env";

  export default { port, fetch: withRequestEnv(myFetchHandler) };
  ```

  Adding the cookie env signal later is then: define it in `@barefootjs/client`, add a `cookie` field to `BfRequestEnv` (and to the `Request`→env derivation behind `withRequestEnv`) — every host wired with `withRequestEnv` picks it up with **no code change**.

- 071a1a3: `<Region>` now lowers to a `bf-region` page-lifecycle boundary (spec/router.md), the smallest end-to-end proof for the router RFC's compiler-derived nested regions. Following the `<Async>` built-in precedent, the compiler recognises `<Region>` (and its self-closing form) by tag name and lowers it to a wrapper `<div>` carrying a deterministic `bf-region="<file scope>:<index>"` id — the `computeFileScope` FNV hash of the source path plus a per-file structural index. Because a layout compiles to one shared partial, every page composing it emits the _same_ id, which is what a client router matches a region on across page documents.

  The id is a static string, so all four adapters (Hono, Go template, Mojolicious, Xslate) emit byte-identical `bf-region="<id>"` markers — no per-adapter template interpolation. Covered by a cross-adapter conformance fixture (`region-boundary`) in addition to the Hono-only emit assertion in `packages/jsx`.

  Recognition is by capitalized tag name; import-scoped disambiguation, a runtime `<Region>` export, nested/sibling runtime diffing, and the scope-ownership dispose/rehydrate path are follow-ups.

- e627b29: `searchParams()` — a request-scoped reactive **environment signal** (spec/router.md **v0.5**, "The wedge"). A same-route, query-only navigation (`/list?sort=price`) driven by `@barefootjs/router` now updates `searchParams()` and the URL **with no swap and no re-hydration** — islands reconcile fine-grained.

  - **`@barefootjs/client`**: new top-level `searchParams: Reactive<() => URLSearchParams>`. It rides the shared `@barefootjs/client/reactive` runtime (structurally one instance), so the existing reactivity analysis wires DOM updates with no new compiler feature. The underlying signal is created lazily on first read (and the router push seam `window.__bf_pushSearch` is installed there, on first read — not at import), so the module has **no import-time side effects** and an island that never reads it can be tree-shaken out of it. The generic `createEnvSignal` stays internal; only `searchParams` is exported. (The spec's package-level `"sideEffects": false` hint is deferred: it currently triggers a bun bundler bug that collapses the runtime entry to a broken re-export facade — a separate follow-up.)
  - **Request-scoped SSR**: on the server `searchParams()` resolves per-request through an injected reader (`__bfSetServerSearchReader`, or a `globalThis.__bf_serverSearchReader` seam) — never a process-wide module global, which would race across concurrent requests.
  - **`@barefootjs/hono`**: auto-wires that reader via `useRequestContext().req` (async-context scoped, race-free) when the SSR scripts are rendered — no opt-in step. `searchParams` is also re-exported from the Hono `client-shim` (SSR) and from `@barefootjs/client/runtime` (the island bundle's import source), and is allow-listed in the compiler so importing it no longer trips `BF051`.

  Covered by a cross-adapter conformance fixture (`search-params`): it runs on Hono today; the Go / Mojolicious / Xslate template adapters are skipped pending env-signal SSR lowering + runtime, tracked in [#1922](https://github.com/piconic-ai/barefootjs/issues/1922).

  The router's query-only short-circuit (shipped in v0) activates automatically once an island reads `searchParams()`; until then query-only navigations fall back to a full swap.

### Patch Changes

- 2339a2f: `<Async>` and `<Region>` are now **import-scoped, import-required** built-ins instead of bare capitalized tag-name matches (#1915, follow-up to #1914).

  The compiler recognises them only when their local binding is imported from `@barefootjs/client` (keyed off `ir.metadata.imports`), so a user's own `<Async>` / `<Region>` component — imported from elsewhere or declared locally — no longer collides with the built-in, and an aliased `import { Async as Boundary }` maps `<Boundary>` through. Real, type-checked `Async` / `Region` stubs now ship from `@barefootjs/client` (they throw if ever executed, since the compiler compiles the tags away), giving authors prop-checking and completion — the model `Portal` already follows, and how Solid imports `<Show>` / `<Suspense>` from `solid-js`. The import is elided on emit (both `templateImports` and the client-JS DOM imports) so it never survives as a phantom runtime import.

  A bare `<Async>` / `<Region>` used without the import and with no other in-scope binding now raises `BF054`. This replaces the per-file `declare function Async(...)` workaround and the `@barefootjs/hono` JSX runtime's `export declare function Async` (removed).

  **Migration:** add `import { Async, Region } from '@barefootjs/client'` to files that use these tags.

- 19af08a: `test-render` re-anchors imports _inside_ pre-compiled child modules too: a `componentModules` child that itself imports another pre-compiled sibling (e.g. a demo root's `accordion` sibling importing `../icon`) previously kept its source specifier in the temp copy and failed module resolution at render time.

## 0.14.0

## 0.13.0

## 0.12.0

## 0.11.0

## 0.10.1

## 0.10.0

## 0.9.6

## 0.9.5

## 0.9.4

## 0.9.3

### Patch Changes

- 5cee919: Fix the two `deno check` errors in `@barefootjs/hono` that originate in our
  own code: add the `override` modifier to `HonoAdapter.renderAsync` (TS4114,
  matching the other adapters), and decode `readFile` output via `TextDecoder`
  in the dev reloader instead of the positional string-encoding overload,
  which Deno's `node:fs/promises` types resolve to a buffer without `.trim`
  (TS2769 + TS2339). `override` is a type-only annotation and the dev-reloader
  change is behaviorally equivalent.
- 3fda4d5: `scripts/jsr-publish.ts`: drop dev-tooling-only export keys (`./build`,
  `./test-render`) and `bun:`-only conditions from the generated JSR
  manifests.

  These entries are Bun-runtime-shaped (test-render uses `Bun.*` /
  `import.meta.dir` directly; the per-adapter build helpers are wired
  for the `bf` CLI which ships as an npm executable) and never load
  cleanly under Deno's type-checker. They were the residual cause of
  `deno publish` type-check failures even after #1792 fixed import
  extensions — JSR was being asked to publish files it had no business
  type-checking against Deno's runtime.

  The npm-published surface is unchanged — these exports remain
  available to Bun / Node consumers exactly as before.

## 0.9.2

## 0.9.1

## 0.9.0

## 0.8.0

## 0.7.0

### Patch Changes

- dc7ba3f: Render the fallback when an async boundary body fails. A `<Async>` / `BfAsync` body that throws synchronously or rejects during async resolution now surfaces the same `fallback` instead of aborting the stream (sync) or leaking an unhandled rejection (async). The body is wrapped in Hono's `ErrorBoundary` on both the runtime `BfAsync` component and the compiled `<Async>` emit path. `BfAsync` also gains an optional `onError` hook so failures aren't swallowed silently.

## 0.6.1

## 0.6.0

### Minor Changes

- 4bfaa9c: Add `@barefootjs/hono/render` with `renderToHtml` and `renderToStream` — a framework-agnostic SSR entry that renders a `hono/jsx` node to an HTML string / `ReadableStream` without a Hono app, router, or `jsxRenderer` request context. This lets any HTTP framework (h3, Elysia, …) host BarefootJS by importing `@barefootjs/hono` as a render runtime, mirroring how the Go `Echo` integration imports the go-template adapter's framework-agnostic `bf` runtime. Additive only; existing exports are unchanged.

## 0.5.3

## 0.5.2

### Patch Changes

- 39a6e6c: `renderHonoComponent` (`@barefootjs/hono/test-render`) can now load child components as real pre-compiled modules via a new `componentModules` option (import specifier → module path), re-anchoring the parent's import instead of inlining + stripping the child's exports. This avoids text surgery on the child's `export` statements entirely for callers that supply pre-compiled modules.

  The inline `components` path (used when no module is supplied) also hardens its export stripping: whole `export { … }` / `export type { … }` specifier blocks — with or without a trailing `from '…'` re-export source — are now dropped cleanly instead of collapsing to a bare `type { … }` syntax error.

## 0.5.1

### Patch Changes

- 8742059: Fix two follow-up issues from the #1663 dynamic-dispatch work.

  `__bfText` could render both a stale element and fresh text in a conditional slot: that path re-resolves the anchor via `$t()` each run, which inserts a new text node before an element left by a previous Node-valued run. Writing a primitive now clears any remaining siblings up to the end marker, so switching JSX → text leaves only the text.

  The no-arg props default (`= {}`) is now asserted to the param's annotated type (`= {} as T`) in both the test and Hono adapters. `hasRequiredProps` treats a prop with a destructuring default as non-required, but the declared props type may still mark that field required, so a bare `= {}` failed `tsc` ("Property 'x' is missing in type '{}'..."). The destructuring defaults still supply the values at runtime.

- 9dcffdf: Compile JSX used as an object-literal arrow value and render dynamic dispatch (#1663).

  A `Record<K, () => JSX>` lookup map (`{ piconic: () => <BrandLogo/> }`) was never lowered: a module-level map had its const dropped from the emitted module (`ReferenceError` at SSR), and a function-local map leaked raw `<...>` into the client bundle (`SyntaxError: Unexpected token '<'`). The preprocessor now hoists arrow values in object-literal property assignments into synthesized components, the same lowering already applied to arrows in JSX-attribute position, so the lookup map survives as component references.

  Dynamic dispatch of such a map in child position (`<div>{themeLogo(props.id)}</div>`) now renders on the client: the dynamic-text effect routes through a new `__bfText` runtime helper that splices the live component element into the slot by identity instead of stringifying it to `"[object HTMLElement]"`. Adapters and `createComponent` default missing props to `{}` so a bare no-arg shim call (`LOGOS[id]()`) no longer crashes destructuring `undefined`.

- 113a17c: Reactive whole-item conditionals in loops (#1665).

  `arr.map(t => cond(t) && <li/>)` (and `cond ? <li/> : null`, `expr || <li/>`,
  `expr ?? <li/>`) makes the conditional the entire loop item, so an item renders
  0-or-1 element per pass. Previously this either threw at hydration (the loop's
  children stayed empty and the whole `.map(...)` was emitted verbatim as
  reactive text — uncompiled inline JSX, undeclared module-level helpers) or, once
  compiled, crashed at runtime (`firstElementChild.cloneNode` on a null element)
  or froze at its server-rendered value.

  This is now fully reactive, with identical behaviour whether the array is a
  `const` or a `signal()`:

  - **Runtime** — new `mapArrayAnchored` tracks each item by an always-present
    `<!--bf-loop-i:KEY-->` anchor comment (not a root element, which the item may
    not have); content lives between the anchor and the next anchor / loop end and
    is derived from the live DOM range each pass. `insert()` accepts the anchor as
    its scope so a whole-item conditional toggles range-scoped to its own item.
  - **Compiler** — detect the whole-item conditional, hoist the key from the
    rendering branch, emit per-item anchors plus a `mapArrayAnchored` renderItem;
    static-array bodies route through the same path. Logical (`&&`/`||`/`??`) and
    ternary JSX-helper map bodies are inlined, and BF023 now requires a key on
    those bodies.
  - **SSR adapters** — Hono, Go, and Mojo emit the per-item `bf-loop-i:KEY` anchor
    so server-rendered lists hydrate. Hono also emits `data-key` on the
    conditional branch's loop-item root, matching Go / CSR.

  Both-branch-element ternaries (`cond ? <A/> : <B/>`) render exactly one element
  and keep their existing `mapArray` path.

## 0.5.0

### Minor Changes

- 6326d07: Unify the importmap manifest type across the component and snippet paths.

  Both importmap injection paths now describe `barefoot-externals.json` with one
  type. `@barefootjs/jsx` exports a shared `ImportMapManifest` (the optional-field
  subset the renderer needs); `renderImportMapHtml` takes it, and the strict build
  output `ExternalsManifest` remains its all-required superset.

  **Breaking (`@barefootjs/hono`):** the `BarefootExternalsManifest` type export is
  removed. Type a `BfImportMap` `externals` prop with `ImportMapManifest` from
  `@barefootjs/jsx` instead (the runtime prop shape is unchanged, so importing the
  parsed `barefoot-externals.json` and passing it through still works).

### Patch Changes

- 5cf7272: Emit `barefoot-importmap.html` for template-string adapters (#1644).

  Follow-up to #1639/#1641. The externals system writes `barefoot-externals.json`
  for every adapter, but the Go html/template and Mojolicious adapters had no
  equivalent of Hono's `BfImportMap` component, so a project configuring
  `externals` there had nowhere to inject the importmap + preloads.

  - `bf build` now emits a ready-to-include `barefoot-importmap.html` snippet
    (generated from the same manifest) alongside `barefoot-externals.json` for
    template-string adapters. Include it via `{{ template "barefoot-importmap.html" . }}`
    (Go) or `%= include 'barefoot-importmap'` (Mojolicious).
  - Add `TemplateAdapter.importMapInjection` (`'component' | 'html-snippet'`) so an
    adapter declares how it exposes the importmap. Hono is `'component'` (no
    snippet emitted); Go/Mojo are `'html-snippet'`.
  - New `renderImportMapHtml` + `ExternalsManifest` exports from `@barefootjs/jsx`
    (and a zero-dependency `@barefootjs/jsx/import-map` subpath) are the single
    source of truth for the snippet HTML. Hono's `BfImportMap` now delegates to it
    so the component and snippet paths cannot drift — the snippet inherits Hono's
    `crossorigin` modulepreload fix (#1648) and the `<`-escaped importmap JSON.
  - New cross-adapter `assertImportMapInjectionContract` in `@barefootjs/adapter-tests`
    fails if a new adapter ships without an importmap injection point, and now also
    asserts parity: the external must resolve _through_ the importmap and every
    `modulepreload` hint must carry `crossorigin`.

## 0.4.0

### Patch Changes

- 9992041: `BfImportMap` now emits `crossorigin` on its `<link rel="modulepreload">` hints (#1648). Cross-origin (CDN) module imports are CORS fetches, so a preload without `crossorigin` couldn't be matched and the browser would discard it and re-fetch — wasting the preload and logging a "preload was not used" warning. The attribute is harmless for same-origin module preloads (same credentials mode either way).

## 0.3.0

### Patch Changes

- 6b99644: `BfImportMap` now consumes `barefoot-externals.json` (#1639):

  - Add an optional `externals` prop (the parsed manifest). Its `importmap.imports` merge on top of the built-in `@barefootjs/client*` mappings, so islands importing configured externals (`zod`, `@barefootjs/form`, …) resolve in the browser instead of 404ing on bare specifiers.
  - Emit `<link rel="modulepreload">` for the manifest's `preloads`, toggleable via a new `preload` prop (defaults to `true`).
  - Keeps `app.ts` runtime-agnostic — the caller imports the JSON and passes it through, matching how `BfScripts` already takes `manifest`. Omitting `externals` preserves the prior client-only output.

## 0.2.0

### Minor Changes

- 89a6ad5: Add .entries()/.keys()/.values() iteration shapes (#1448 Tier B)

### Patch Changes

- Updated dependencies [2313724]
- Updated dependencies [bac95e6]
- Updated dependencies [4e4d31a]
- Updated dependencies [bff7df6]
- Updated dependencies [31ce089]
- Updated dependencies [89a6ad5]
  - @barefootjs/shared@0.2.0
  - @barefootjs/client@0.2.0
  - @barefootjs/jsx@0.2.0

## 0.1.3

### Patch Changes

- Updated dependencies [91523ba]
- Updated dependencies [a5a466c]
- Updated dependencies [a57e113]
  - @barefootjs/jsx@0.1.3
  - @barefootjs/client@0.1.3
  - @barefootjs/shared@0.1.3

## 0.1.2

### Patch Changes

- @barefootjs/client@0.1.2
- @barefootjs/jsx@0.1.2
- @barefootjs/shared@0.1.2

## 0.1.1

### Patch Changes

- c896b8b: Fix published packages: resolve workspace:\* and point exports to dist/
- Updated dependencies [c896b8b]
  - @barefootjs/client@0.1.1
  - @barefootjs/jsx@0.1.1
  - @barefootjs/shared@0.1.1
