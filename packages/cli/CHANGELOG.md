# @barefootjs/cli

## 0.31.0

### Minor Changes

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

- b202137: Scaffolds emit `vite.config.ts` instead of `barefoot.config.ts`

  All nineteen integrations run on `@barefootjs/vite`, and PR 7a made `bf`
  read its project config from `vite.config.ts` (with `barefoot.config.ts`
  still working as a fallback). Until now, `bf init` (and therefore
  `npm create barefootjs@latest`) kept generating fresh projects wired to the
  legacy pipeline: every scaffold wrote a `barefoot.config.ts` targeting
  `@barefootjs/<adapter>/build`'s `createConfig`, with `bf build [--watch]`
  wired into every `dev`/`build`/`start` script. This PR is the last thing
  standing between here and deleting that pipeline (7c).

  **Every scaffold** (`hono`, `hono-node`, `echo`, `gin`, `chi`, `nethttp`,
  `mojo`, `xslate`, `csr`) now writes `vite.config.ts` using that adapter's
  composed plugin — `import { barefoot } from '@barefootjs/<adapter>/vite'`
  (CSR uses `@barefootjs/vite` directly with `CSRAdapter`, matching the
  migrated `integrations/csr`) — mirroring the shape of the corresponding
  migrated integration rather than inventing a new one. `package.json`'s
  `dev`/`build`/`start` scripts now run `vite build`/`vite dev` (SSR
  adapters: `vite build` once up front so the compiled templates exist
  before the backend server starts, then `vite dev` takes over the watch
  loop with dev-origin script URLs; CSR: `vite build --watch`, since it has
  no backend to bake a dev-origin URL into — see its `vite.config.ts`'s
  docstring). `--minify` is gone from every build/deploy script — `vite
build` minifies production output by default, no flag needed.

  Hono's renderer (`@barefootjs/hono/scripts`'s `<BfScripts />`) no longer
  needs a hand-wired import map or a `manifest.json` prop: under Vite,
  `@barefootjs/client` is an ordinary bundled ESM specifier every compiled
  entry imports, and `HonoAdapter.generate()` bakes each component's
  Vite-resolved script URL(s) into its SSR template at codegen time.

  Every `vite.config.ts` sets `publicDir: false` — the scaffold's own
  `public/` (hand-written CSS + `unocss --watch`'s output) is served
  directly by each backend, not by Vite, and Vite's default publicDir
  behavior (copy it verbatim into `build.outDir`) would otherwise write a
  second, build-order-dependent copy that goes stale relative to
  `unocss`'s own regeneration — discovered by inspecting real build
  output, not by inspection alone. Every `vite.config.ts` also adds a
  `resolve.alias` mapping `@/components` to the source `components/`
  dir, mirroring `tsconfig.json`'s existing path mapping: `tsc`/`tsx`
  already read that from `tsconfig.json`, but Vite's dev-server dependency
  pre-scan (esbuild, run before this plugin's own `transform` hook ever
  sees a file) parses raw source directly and has no notion of tsconfig
  `paths` without it — `vite dev` failed to resolve the starter Counter's
  registry `<Button>` import without this.

  The CSR scaffold's starter Counter switches to the bare, registry-free
  variant (`bundledRegistryComponents: []`, following the Xslate
  scaffold's own precedent for a different compiler gap): the registry
  `<Button>`/`<Slot>` pair each re-export named types, and the compiler
  always emits that re-export line into a component's `markedTemplate`
  output regardless of adapter. With no `templates` dir configured (CSR's
  whole point), `@barefootjs/vite`'s `assertNoRealTemplateOutput` guard
  correctly refuses to silently drop that non-empty output, so `vite
build` failed outright the moment the scaffold's default Button fetch
  pulled it in — a latent compiler/CSR interaction no existing
  integration had ever exercised (every migrated integration's
  CSR-equivalent Counter uses native `<button>` elements).

  `bf init`'s "already initialized" guard now checks for `vite.config.ts`
  instead of `barefoot.config.ts`. `packages/adapter-tests/src/
scaffold.contract.ts`'s cross-adapter contract asserts `vite.config.ts` is
  written (step 3) instead of `barefoot.config.ts`; the Hono and Mojolicious
  `scaffold.test.ts` integration suites assert the new config's shape and
  dev script.

  Verified by scaffolding and building real projects — `chi` (Go),
  `hono-node` (JS/Node), and `csr` — via the built CLI, installing real
  packed `@barefootjs/*` tarballs (not a monorepo `file:` symlink, which
  hits an unrelated dual-module-instance hazard), and running both
  `<pm> run build` and `<pm> run dev` (the `vite build`/`vite dev` +
  backend-server watch loop) to a live server serving hydrated SSR HTML /
  a working CSR page with correctly resolved static assets.

### Patch Changes

- 1b31dc1: Remove the internal `resolve-imports.ts` inliner (and its tests). Its only
  remaining callers were `site/ui/build.ts` and `site/core/build.ts`, which
  now build through `@barefootjs/vite` — Rollup owns import resolution,
  bundling, and dedup for client JS, so the CLI-side inliner is dead code.
  No published CLI surface changes.
- Updated dependencies [ad323bd]
- Updated dependencies [5b05b4b]
- Updated dependencies [c92097b]
  - @barefootjs/client@0.31.0
  - @barefootjs/shared@0.31.0

## 0.30.6

### Patch Changes

- @barefootjs/client@0.30.6
- @barefootjs/shared@0.30.6

## 0.30.5

### Patch Changes

- @barefootjs/client@0.30.5
- @barefootjs/shared@0.30.5

## 0.30.4

### Patch Changes

- @barefootjs/client@0.30.4
- @barefootjs/shared@0.30.4

## 0.30.2

### Patch Changes

- @barefootjs/client@0.30.2
- @barefootjs/shared@0.30.2

## 0.30.1

### Patch Changes

- @barefootjs/client@0.30.1
- @barefootjs/shared@0.30.1

## 0.30.0

### Patch Changes

- Updated dependencies [d95eb19]
  - @barefootjs/client@0.30.0
  - @barefootjs/shared@0.30.0

## 0.29.0

### Patch Changes

- df39298: Stop treating a class field name as a value reference

  `isValueReferenceIdentifier` excluded object-literal keys, method names and
  accessor names, but not `ts.PropertyDeclaration` — a class field. So in

  ```js
  class Widget {
    helper = 1;
  }
  ```

  the field name `helper` was classified as a read of a binding called `helper`.
  It isn't; it's a member key, exactly like the `{ helper: 1 }` case one branch
  above it.

  The two callers of this classifier are hurt very differently by an over-report,
  which is what makes this worth a patch rather than a tidy-up:

  - **`detectStrippedReferences` (cli) — a false build error.** BF053 fires when a
    relative import was stripped from a client bundle but its binding is still
    referenced. With the gap, a stripped binding whose name merely _coincided_
    with a class field name anywhere in the assembled bundle failed the build,
    pointing the developer at a reference that does not exist. Legal code, red
    build. Inlined `.ts` helper modules are arbitrary user code, so a class with a
    field named after some unrelated stripped import is not a contrived shape.
  - **`makeValueUsageTest` (jsx) — a redundant import.** The client bundle kept an
    import it didn't need. Harmless, since the binding does exist, but it defeats
    the point of the reference-based check that replaced the old text scan.

  A **computed** field name stays a reference: in `class C { [helper] = 1 }` the
  brackets make `helper` a genuine read, and the exclusion is guarded on
  `parent.name === id`, which the computed form doesn't satisfy (its `name` is a
  `ComputedPropertyName` node, not the identifier). Both directions are pinned by
  tests. `new.target` is excluded for the same reason as the field name — `target`
  sits in keyword position and is not a binding either.

  The classifier also now states its contract, since #2432 exported it as public
  API: it classifies positions in **JavaScript** source, which is what both
  callers parse (`ts.ScriptKind.JS`). Identifiers in TypeScript type positions —
  `const x: Foo`, `interface` / `type` / `enum` declaration names — are still
  reported as value references, so it must not be pointed at TypeScript source.
  Every exclusion branch is really a BF053 misfire that can't happen anymore,
  which is the lens to read that list through.

- Updated dependencies [e3b3efd]
- Updated dependencies [d87c070]
  - @barefootjs/client@0.29.0
  - @barefootjs/shared@0.29.0

## 0.28.1

### Patch Changes

- 51c8720: Stop per-specifier type-only imports from leaking into the client bundle as value imports

  `import { paperColor, type Theme } from '../lib/theme'` could put `Theme` — a
  type, with no value binding anywhere — into the generated client JS as a value
  import, and from there into the relative-import inliner's IIFE return:

  ```js
  const __bf_inline_0 = (() => {
    function paperColor2(t) { … }
    return { paperColor: paperColor2, Theme };
    //                                ^^^^^ never declared — it is a type
  })();
  ```

  `Theme` has no binding in the IIFE, so the module threw
  `ReferenceError: Theme is not defined` before anything hydrated. The whole
  page's client JS was dead, and because the SSR markup stayed on screen it read
  as "hydration silently never ran" rather than as a load error.

  Two independent gaps compounded in `collectExternalImports`
  (`ir-to-client-js/imports.ts`), which decides which specifiers survive into the
  client bundle:

  - Only the **declaration-level** `imp.isTypeOnly` was consulted. The analyzer
    has recorded per-specifier `spec.isTypeOnly` since #1915, but this loop never
    read it, so `{ type Foo }` was indistinguishable from `{ Foo }`.
  - Usage was decided by a `\bname\b` text scan over the emitted code. A word
    boundary is not a reference: an object key (`{ Theme: 'テーマ' }`), a string
    literal (`'Theme'`), a property access (`obj.Theme`) all matched.

  Either alone was survivable — the first only mattered if the name happened to
  appear, the second only over-emitted imports whose bindings existed. Together,
  a type name that merely _appeared as a word_ became a value import.

  The fix closes both halves, plus adds a backstop for anything that still slips
  through:

  - **Per-specifier type-only specifiers are skipped** at every site that emits
    an import into a client bundle: `collectExternalImports`, the state-only
    module path in `compiler.ts`, and `collectUserDomImports` — where
    `import { createSignal, type Signal } from '@barefootjs/client'` would
    otherwise emit `Signal` from the `/runtime` subpath, which does not export it.
    The two sites that only _read_ the flag are guarded too, so a type-only
    specifier no longer forces a `.client.js` source rewrite or trips the
    browser-only-API diagnostic.
  - **Usage is a value-reference test, not a text scan.** The new
    `collectValueReferencedNames` (`value-references.ts`) walks the emitted code
    with the TypeScript parser and keeps only identifiers in genuine value
    positions, reusing the `isValueReferenceIdentifier` classifier that the CLI's
    stripped-import detector already had (now shared, one door, so the two
    "is this a real use" checks in the pipeline cannot drift apart). A shorthand
    property (`{ helper }`) counts — it reads the binding. When the text cannot be
    parsed cleanly the helper answers `null` and callers fall back to the old text
    scan: narrowing on a partial parse would _drop_ a needed import, which is the
    one direction this must never fail in.
  - **`BF055` — inlined module missing a requested export.** `buildTopLevelIIFE`
    now compares the names its consumers ask for against the module's export
    surface and fails the build with the name, the module, and the exact
    `ReferenceError` it would have produced. The emitted `return` is left
    unchanged on purpose: the build error is the deliverable, and the throwing
    artifact stays as the loud signal for anyone who ships past a red build. The
    check is skipped when the surface is not exhaustively enumerable (an
    `export * from './other'`), and the surface counts everything a module's
    `export` clauses legally NAME — re-exports, `export enum`,
    `export namespace` — so a legal module shape can never produce a false
    failure. That surface is deliberately wider than the set that populates the
    namespace IIFE's `return`, which stays restricted to names with a binding in
    the inlined body. The module source is parsed at most once per module, and
    not at all when neither the namespace return nor the check needs it —
    `inlineRelativeImports` is `bf build` hot path.

  Note this only ever bit projects that do **not** set `localImportPrefixes` —
  with it set, relative imports leave the loop before the usage test. It is not
  part of `createConfig`'s documented surface for a Hono project, so a stock
  config took the scanning path for every relative import.

  - @barefootjs/client@0.28.1
  - @barefootjs/shared@0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies [fe474a0]
- Updated dependencies [483496b]
- Updated dependencies [c3c435a]
- Updated dependencies [27b0648]
- Updated dependencies [86f5f68]
- Updated dependencies [4274898]
  - @barefootjs/client@0.28.0
  - @barefootjs/shared@0.28.0

## 0.27.0

### Patch Changes

- Updated dependencies [807b1a5]
- Updated dependencies [e71e19d]
- Updated dependencies [17af2ae]
- Updated dependencies [76f0dea]
  - @barefootjs/client@0.27.0
  - @barefootjs/shared@0.27.0

## 0.26.4

### Patch Changes

- Updated dependencies [6114df8]
- Updated dependencies [b0817cc]
  - @barefootjs/client@0.26.4
  - @barefootjs/shared@0.26.4

## 0.26.3

### Patch Changes

- @barefootjs/client@0.26.3
- @barefootjs/shared@0.26.3

## 0.26.2

### Patch Changes

- @barefootjs/client@0.26.2
- @barefootjs/shared@0.26.2

## 0.26.1

### Patch Changes

- @barefootjs/client@0.26.1
- @barefootjs/shared@0.26.1

## 0.26.0

### Patch Changes

- Updated dependencies [050513c]
  - @barefootjs/client@0.26.0
  - @barefootjs/shared@0.26.0

## 0.25.0

### Patch Changes

- @barefootjs/client@0.25.0
- @barefootjs/shared@0.25.0

## 0.24.1

### Patch Changes

- @barefootjs/client@0.24.1
- @barefootjs/shared@0.24.1

## 0.24.0

### Patch Changes

- Updated dependencies [f7f955a]
  - @barefootjs/client@0.24.0
  - @barefootjs/shared@0.24.0

## 0.23.0

### Patch Changes

- 3047ab8: Reactive-factory helpers (#931 round 2, #2325): factories may now return a
  shorthand object literal (`return { count, setCount }`) destructured as
  `const { count } = factory(...)`, and may be imported from a relative path.
  New diagnostics: BF111 (property renames in factory object returns/destructures),
  BF112 (imported factory capturing helper-module bindings); BF110 now also covers
  reactive-looking object-destructure call sites that previously failed silently.
  CLI: dependency scanner tracks `.jsx`/`.js` relative imports for cache invalidation.
  - @barefootjs/client@0.23.0
  - @barefootjs/shared@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies [fdc5b3e]
  - @barefootjs/client@0.22.0
  - @barefootjs/shared@0.22.0

## 0.21.4

### Patch Changes

- Updated dependencies [ffd65a8]
  - @barefootjs/client@0.21.4
  - @barefootjs/shared@0.21.4

## 0.21.3

### Patch Changes

- 1715e34: Ignore `public/.dev/` in the Hono scaffold's generated `.gitignore`. The `--watch` dev-reload sentinel (`public/.dev/build-id`, written by `bf build --watch` after every successful rebuild) is build output, not source. Every other adapter ignores its `dist/` outDir wholesale, so their `.dev/` is already covered; Hono's outDir _is_ the committed `public/`, so it names generated children (`public/components/`, `public/.buildcache.json`, `public/.bfemit.json`) explicitly and was missing the sentinel — leaving new scaffolds staging `public/.dev/build-id` on their first `git add`.
- 1bc5ae8: Fix #2309: `bf build` with a warm cache over-tree-shook `barefoot.js`, dropping runtime exports (e.g. `__bfSlot`) that cached client components still imported and breaking all hydration at module load (`does not provide an export named '__bfSlot'`). The step-6d tree-shake collector scans each emitted `*.client.js` on disk, but a cached component's file was already rewritten on a prior build (step 6c) from `@barefootjs/client*` to a relative `../barefoot.js` import — a form the collector's bare-specifier match never recognized, so a warm rebuild collected zero runtime imports for those files and shipped a smaller keep-set than a fresh build. The collector now recognizes the emitted relative `barefoot.js` runtime specifier — at any nesting depth and including an intermediate directory segment when `outputLayout.runtime` differs from `outputLayout.clientJs` (e.g. `../runtime/barefoot.js`) — as well as the bare `@barefootjs/client*` one, so `barefoot.js` satisfies every emitted client bundle regardless of cache state or output layout. This also preserves the unsafe-import (full-runtime) fallback for a dynamic `import()` of the runtime whose specifier was rewritten to the relative form. Removes the need for the `bf build --force` workaround.
- Updated dependencies [69ae86b]
  - @barefootjs/client@0.21.3
  - @barefootjs/shared@0.21.3

## 0.21.2

### Patch Changes

- @barefootjs/client@0.21.2
- @barefootjs/shared@0.21.2

## 0.21.1

### Patch Changes

- Updated dependencies [83956ce]
  - @barefootjs/client@0.21.1
  - @barefootjs/shared@0.21.1

## 0.21.0

### Patch Changes

- Updated dependencies [10fa0df]
- Updated dependencies [ea50cdc]
  - @barefootjs/client@0.21.0
  - @barefootjs/shared@0.21.0

## 0.20.0

### Patch Changes

- @barefootjs/client@0.20.0
- @barefootjs/shared@0.20.0

## 0.19.1

### Patch Changes

- @barefootjs/client@0.19.1
- @barefootjs/shared@0.19.1

## 0.19.0

### Patch Changes

- @barefootjs/client@0.19.0
- @barefootjs/shared@0.19.0

## 0.18.7

### Patch Changes

- 42e9066: Perf: new `runtimeBundle: 'treeshake-exact'` build mode (#2143 gap 4) drops the always-kept public mount API (`render`, `hydrate`, `flushHydration`, `rehydrateAll`, `rehydrateScope`, `disposeScope`, `setupStreaming`, `createSearchParams`) that `'treeshake'` (the default) unconditionally keeps in `barefoot.js` regardless of whether the project actually uses them. Under `'treeshake-exact'` these names ship only if the compiled output, `bundleEntries`, `externals`, or an explicit `runtimeKeep` entry actually reaches them — a hand-written page script the CLI never compiles (e.g. an inline `<script type="module">` calling `hydrate()` directly) must list any such name in `runtimeKeep` or it's silently dropped. Fully opt-in; `'treeshake'` stays the default with unchanged behavior. Also fixes a real crash-to-full-copy bug the new mode could hit: a project with zero reachable runtime exports now skips `barefoot.js` generation (and removes any stale copy from a prior build) instead of failing into shipping the entire uncompressed runtime.
- Updated dependencies [fd73cf0]
- Updated dependencies [42e9066]
  - @barefootjs/client@0.18.7
  - @barefootjs/shared@0.18.7

## 0.18.6

### Patch Changes

- Updated dependencies [09e8eb9]
  - @barefootjs/client@0.18.6
  - @barefootjs/shared@0.18.6

## 0.18.5

### Patch Changes

- 495b08a: Stop fresh Hono/Cloudflare scaffolds from failing `npm install` with ERESOLVE whenever wrangler flips which `@cloudflare/workers-types` major it peers on. wrangler has bounced between `^4` (4.107.1) and `^5` (4.108.0 deprecated same-day, then 4.110.0) across recent point releases, and each flip broke the scaffold's single-major pin (bun tolerates the mismatch; npm does not — caught by the smoke-publish CI gate). The `bf init` / create-barefootjs Hono template now pins `@cloudflare/workers-types` to `^4.20260702.1 || ^5.20260708.1`, so npm installs whichever major the resolved wrangler actually peers on — v5 today, v4 automatically if a deprecation falls back to a v4-peering wrangler — with no ERESOLVE either way. Verified end-to-end against both wrangler 4.110.0 (peers v5) and 4.107.1 (peers v4).
- 3c1f726: Fix fresh Hono/Cloudflare scaffolds failing `npm install` with ERESOLVE again: wrangler 4.108.0 (which had moved its `peerOptional @cloudflare/workers-types` to `^5.20260706.1`) was deprecated by its publisher the same day it shipped ("causing deployment failures in CI ... downgrade to 4.107.1"). npm's resolver skips a deprecated version when satisfying a semver range, so `wrangler: '^4.0.0'` now resolves back to `4.107.1`, which peers on `^4.20260702.1` — conflicting with the `^5.20260706.1` pin from the previous fix (bun tolerates the mismatch; npm does not — caught by the smoke-publish CI gate). The `bf init` / create-barefootjs Hono template now pins `@cloudflare/workers-types@^4.20260702.1` again, matching whichever wrangler version npm actually resolves rather than whichever version last shipped upstream. Verified end-to-end with `bun run scripts/smoke-publish.mjs` (full pack + scaffold + `npm install` + `npm run build`/`test`).
- Updated dependencies [7bd1762]
  - @barefootjs/shared@0.18.5
  - @barefootjs/client@0.18.5

## 0.18.4

### Patch Changes

- Updated dependencies [23cc4dc]
  - @barefootjs/shared@0.18.4
  - @barefootjs/client@0.18.4

## 0.18.3

### Patch Changes

- @barefootjs/client@0.18.3
- @barefootjs/shared@0.18.3

## 0.18.2

### Patch Changes

- ecee9a4: Fix fresh Hono/Cloudflare scaffolds failing `npm install` with ERESOLVE: wrangler 4.108.0 moved its `peerOptional @cloudflare/workers-types` to `^5.20260706.1`, conflicting with the template's `^4.20250101.0` pin (bun tolerates the mismatch; npm does not — caught by the smoke-publish CI gate). The `bf init` / create-barefootjs Hono template now pins `@cloudflare/workers-types@^5.20260706.1`; v5 still ships a root `index.d.ts`, so the generated tsconfig's `"types"` entry resolves unchanged.
  - @barefootjs/client@0.18.2
  - @barefootjs/shared@0.18.2

## 0.18.1

### Patch Changes

- @barefootjs/client@0.18.1
- @barefootjs/shared@0.18.1

## 0.18.0

### Minor Changes

- fa03384: Fix multi-component registry modules (Toast/Dialog/Tabs/DropdownMenu) 500ing on the Perl (mojo) adapter (#2132). A registry module exporting several components from one file compiles to one EP template per component, but the build manifest carried a single `markedTemplate` per entry, so `register_components_from_manifest` never registered the sub-components and every `render_child('toast_provider')` died with "No renderer registered".

  - **`@barefootjs/cli`**: for `templatesPerComponent` adapters, each manifest entry now carries a `components` map — one row per exported component with its own `markedTemplate` and `ssrDefaults`, keyed by the component name. The key comes from the compiler's new structural `componentName` stamp, not the template basename (a single-component file's template is named after the source file, e.g. `index.html.ep`). Additive: every runtime parses manifest entries key-by-key, so older runtimes ignore the new field.
  - **`@barefootjs/jsx`**: `FileOutput` gains an optional `componentName`, set on `markedTemplate` / `ssrDefaults` outputs so the build pipeline can pair them per component without basename guessing.
  - **`@barefootjs/perl`**: `register_components_from_manifest` registers one child renderer per `components` row under the snake_cased component name the compiled templates call (`toast_provider`, `toast_title`, …), seeding each child from its own per-component `ssrDefaults`. Per-component registrations win over the directory-name key — for `ui/toast/index` the key `toast` now resolves to Toast's own template instead of the module's first template (ToastProvider). Manifests from older builds (no `components` map) keep the directory-name behaviour.
  - **`@barefootjs/mojolicious`** (`BarefootJS::Backend::Mojo`): `render_named` now dies when `render_to_string` returns undef (missing template) instead of letting the calling template's `<%==` silently render the child subtree as an empty string, and the active `bf.instance` swap is `local`ized so it's restored when a nested render dies.

### Patch Changes

- d6eb672: Adapter discovery: `--list-adapters` prints every adapter id + CSS library option; `--adapter go`/`golang`/`perl` now get a targeted hint naming the concrete adapter ids instead of the generic unknown-adapter error; a failed init no longer leaves an empty target directory behind; adapter/css choices resolved via flags or `--yes` print the same "✔" confirmation lines as the interactive picker.
- ee52d11: Touch `uno.config.ts` after `bf add` writes new component files so a running `unocss --watch` re-scans its globs and generates styles for newly-created component directories.
- 0636582: `bf build` now tree-shakes the client runtime bundle (`barefoot.js`) down to only the `@barefootjs/client*` exports a project's compiled client JS (components, `bundleEntries`, rebundled `externals` chunks) actually imports, plus a small always-kept public mount API (`render`, `hydrate`, `flushHydration`, `rehydrateAll`, `rehydrateScope`, `disposeScope`, `setupStreaming`, `createSearchParams`) for hand-written page scripts the compiler never sees. Previously `barefoot.js` was always a byte-for-byte copy of the entire prebuilt runtime regardless of what the project used — on the CSR benchmark app this shipped ~72KB raw / ~19.4KB gzip; the same app now ships ~24KB raw / ~8.8KB gzip.

  New config surface (`createConfig()` in `@barefootjs/client/build`, or any `barefoot.config.ts`):

  - `runtimeBundle?: 'treeshake' | 'full'` — defaults to `'treeshake'`. Set to `'full'` to restore the previous verbatim-copy behavior.
  - `runtimeKeep?: string[]` — extra runtime export names to force-keep, for names only ever referenced from hand-written page scripts beyond the always-kept set.

  Safety: if the collector sees an import shape it can't safely narrow (a namespace import, a default import, or a dynamic `import()` of the runtime — reachable only through `bundleEntries`/rebundled `externals`, since the compiler's own component codegen never emits these shapes), the build falls back to a full runtime copy for that build and logs why, rather than risk shipping a `barefoot.js` missing something that's actually used.

- f20a0a3: Fix two Go template adapter codegen bugs against generated props structs (#2130, #2131):

  - **#2130** — a `.map()` loop whose body is an element _wrapping_ a child component (`<li><Badge>…</Badge></li>`) retargeted its `{{range}}` at a `.{ChildName}s` slice that only exists for direct single-component bodies, 500ing at render with `can't evaluate field Badges in type *XxxProps`. The range now iterates the real collection (gated on the IR's `loop.childComponent`, the same condition the slice generator uses), and the wrapped child renders through the parent's once-per-slot instance (`$.{Name}SlotN`) with per-item children injected via the loop-body companion define.
  - **#2131** — `bf build` never registered child component shapes on the adapter (only the test harness did), so HTML attributes passed to a rest-spread child (`<Input placeholder="…" />`) were emitted as named Go struct fields the generated `Input` struct doesn't declare, breaking `go build` with `unknown field Placeholder`. The CLI now runs a metadata-only pre-pass (`analyzeComponent` + `buildMetadata` per discovered component) that registers every component's shape before the first entry compiles, so non-param attrs route into the child's `Props map[string]any` rest bag.

- abde658: Include `eval.go` in Go scaffold templates so all four Go adapters (chi/gin/echo/net/http) compile out of the box. Since #2018 `bf.go` references `SortEval`, `FoldEval`, `FilterEval`, `Env` etc. from `eval.go`, but the file was never added to the CLI's embedded scaffold templates.
- 693b6cc: Register `TemplateFuncMap` in scaffolded `bf_render.go` so `bf_tmpl` calls work out of the box. The scaffold only called `bf.FuncMap()` but not `bf.TemplateFuncMap(root)`, causing `function "bf_tmpl" not defined` on first render.
- e76405d: Fix the Mojo scaffold's stock `/` route 500ing with `Global symbol "$initial" requires explicit package name` (#2126):

  - `Mojolicious::Plugin::BarefootJS` now resolves the build manifest lazily per render (cached on the file's mtime/size) instead of once at plugin-register time. The scaffold's dev script starts `bf build --watch` and morbo concurrently, so the app routinely boots before the first build writes `dist/templates/manifest.json` — previously that startup race disabled ssrDefaults stash seeding for the server's lifetime and every top-level render died under strict. Rebuilt manifests (`bf build --watch`, `bf add`) are now also picked up without a server restart.
  - `extractSsrDefaults` seeds every prop declared on a bare-props parameter's type (`function Foo(props: Props)`), not just the ones a signal/memo initializer references. Template-stash adapters flatten `props.X` to a bare scalar (`$X`), so a direct template read of an unseeded, unpassed prop was a strict-mode compile error rather than a soft `undef`.
  - The mojo scaffold's `/` route now passes `initial => 0` explicitly, keeping the starter page self-sufficient and doubling as the worked example of how props reach a component (they're stash values).

- 9a9fb09: Scaffold reproducibility: `@barefootjs/*` dependencies in generated `package.json` are now pinned to `^<CLI version>` at scaffold time instead of `"latest"`, and the Hono scaffold adds `wrangler` as a pinned devDependency invoked directly from `node_modules/.bin` (no more unpinned `npx wrangler` download on first `npm run dev`).
- f126fdf: Scaffold polish: every adapter now ships a `favicon.svg` plus a `<link rel="icon">` (no more 404 on first dev-server load), `bf init` generates a README.md with getting-started commands for the detected package manager and a `bf` CLI cheat-sheet, and the scaffold `build`/`deploy` scripts pass `--minify` to `bf build` so production output matches the documented "~14 kB min+gzip" runtime size.
- Updated dependencies [0636582]
- Updated dependencies [99cae9d]
- Updated dependencies [d05cc49]
- Updated dependencies [435d996]
  - @barefootjs/client@0.18.0
  - @barefootjs/shared@0.18.0

## 0.17.1

### Patch Changes

- @barefootjs/client@0.17.1
- @barefootjs/shared@0.17.1

## 0.17.0

### Patch Changes

- Updated dependencies [e9ed338]
- Updated dependencies [caba215]
- Updated dependencies [c8c7d50]
  - @barefootjs/client@0.17.0
  - @barefootjs/shared@0.17.0

## 0.16.0

### Minor Changes

- c921865: Add agent-oriented gates and a machine-readable contract to `bf debug profile` (#1841).

  A dynamic run (`--scenario`) now carries an agent contract in its JSON: a normalized top-level `status` (`ok`/`warning`/`error`), a flattened `findings` array (each with `severity`, an explicit `actionable` flag, and ready-to-run `nextCommands` like `bf debug trace <comp> <signal> --json`), a `coverage.ratio`, and — when handlers were under-exercised — `guidance` pointing at a story/scenario file. The structured per-analysis tables are unchanged; this is an additive agent view alongside them.

  New opt-in CI gates make the command fail with intent: `--fail-on unresolved|hot|coverage` (with `--scenario`) and `--fail-on regression` (with `--diff`), plus the numeric thresholds `--min-coverage`, `--max-runs-per-turn`, and `--max-unresolved`. A tripped gate exits non-zero, escalates `status` to `error`, and emits a `gates` block (`{passed, failed, checks}`). By default no gate is active, so an ungated run is unchanged.

### Patch Changes

- @barefootjs/client@0.16.0
- @barefootjs/shared@0.16.0

## 0.15.2

### Patch Changes

- @barefootjs/client@0.15.2
- @barefootjs/shared@0.15.2

## 0.15.1

### Patch Changes

- e66227c: `bundleEntries` now keeps `@barefootjs/client`, `@barefootjs/client/runtime`, and `@barefootjs/client/reactive` external implicitly, so configs no longer have to repeat them per entry.

  In a BarefootJS app these specifiers always resolve through the page's import map to the shared `barefoot.js` runtime that the compiled islands import — inlining them into a bundled entry would fork the reactive runtime (duplicate signals, #927). Previously these keys were only auto-applied when `externals` was non-empty; a `bundleEntries` entry in a project without vendor externals had to list them by hand or risk bundling a second runtime. They are now merged into every entry's external set (deduped with any configured `externals` and per-entry overrides). A `router-entry` bootstrap can be declared as simply `{ entry: 'client/router-entry.ts', outfile: 'router-entry.js' }`.

  - @barefootjs/client@0.15.1
  - @barefootjs/shared@0.15.1

## 0.15.0

### Patch Changes

- Updated dependencies [2339a2f]
- Updated dependencies [c6212ab]
- Updated dependencies [071a1a3]
- Updated dependencies [e627b29]
- Updated dependencies [623c0f7]
  - @barefootjs/client@0.15.0
  - @barefootjs/shared@0.15.0

## 0.14.0

### Patch Changes

- 1bb8d53: fix(cli): `bf debug profile --scenario` failed with a raw `Cannot find module`
  for any component importing a local plain (non-component) module (#1873)

  The scenario driver writes the joined client chunks to a temp file before
  importing them, but a plain `.ts` helper emits no client JS — its compiled
  result is discarded while the `import { x } from '../lib/helper'` line survives
  verbatim and resolves (and fails) against the temp directory. Relative imports
  in each chunk are now rewritten before the run: an import of a file whose
  compiled client JS is already concatenated into the run is dropped (the chunks
  share one module scope), and an import of a plain local module is rewritten to
  the absolute path of the original source, which bun loads directly. A relative
  specifier that resolves to no file at all now throws an actionable error
  instead of bun's raw module-resolution stack.

  - @barefootjs/client@0.14.0
  - @barefootjs/shared@0.14.0

## 0.13.0

### Minor Changes

- 361082e: Add a `--css none` (bring your own CSS) option to `bf init` / `create-barefootjs`. Selecting it (via the interactive prompt or `--css none`) opts out of the UnoCSS + UI-registry layer across every adapter: no registry probe/fetch, no `uno.config.ts` or stylesheets, no `unocss` in the package.json scripts/devDeps, and a dependency-free starter `Counter` built from native `<button>` elements. The default `unocss` path is unchanged.

### Patch Changes

- @barefootjs/client@0.13.0
- @barefootjs/shared@0.13.0

## 0.12.0

### Patch Changes

- 003b57e: fix(cli): `bf debug profile --scenario` crashed with `Dynamic require of "node:events" is not supported` (#1871)

  The published CLI is a single-file ESM bundle, but the dynamic profiler's
  lazily-imported DOM stack (happy-dom, whose `ws` dependency is CJS) calls
  `require('node:events')` and friends at runtime. esbuild routes those through a
  `__require` shim that throws under both Node and Bun unless a real `require`
  exists in module scope. The bundle now defines one via
  `createRequire(import.meta.url)` in the build banner, and the published-tarball
  smoke suite runs `bf debug profile --scenario auto` so this interop class can't
  regress silently again.

  - @barefootjs/client@0.12.0
  - @barefootjs/shared@0.12.0

## 0.11.0

### Minor Changes

- 42974e4: feat: `bf debug profile` — static reactive profiler, v1 (#1690 SR5 + SR6)

  Implements `bf debug profile` and companion library support.

  **Command surface:**

  - `bf debug profile <component>` — static reactive budget for a single component
  - `bf debug profile --scenario auto` — ranked table for all reactive components in `ui/components/ui/`
  - `bf debug profile --scenario <path.tsx>` — profile a specific file
  - `bf debug profile <component> --diff` — compare current IR vs git HEAD (SR6 compile-diff)
  - `--json` flag throughout

  **Static analyses (SR5):**

  - Max signal fan-out and hot-signal identification
  - Max memo chain depth
  - Total subscription count (Σ deps across memos, effects, DOM bindings)
  - Batch candidates (handlers that set ≥2 distinct signals — `batch()` opportunities)
  - Findings: `high-fan-out`, `deep-memo-chain`, `batch-candidate`, `fallback-heavy`

  **SR6 (compile-diff):**

  - `diffProfiles(before, after)` — surfaces regressions in fan-out, chain depth, fallbacks, subscriptions; improvements in the same metrics; neutral structural count changes.

  **Bug fixes bundled in this PR:**

  - **Bug A (debug.ts):** `buildComponentGraph` now falls back to the caller-supplied `filePath` when `findSourceFile` returns empty for non-reactive components. Previously `bf debug graph Button` showed `Button ()` (empty path); now correctly shows `Button (/path/to/button/index.tsx)`.

  - **Bug C (debug-profile.ts):** Batch-candidate findings from handlers wired to multiple JSX locations (e.g. Calendar dual-month navigation) were reported once per JSX site. Deduplicated by `(kind, file, line, signals-set)` so each logically unique handler appears once.

  - **Bug D (debug-profile.ts):** `batchCandidateCount` in metrics and the batch-candidate findings list used independent counting, causing the table column to disagree with the findings section. Both now use the same deduplicated set.

  **Known limitation (Bug B — batch-candidate precision):** Static analysis resolves setter calls by regex without control flow awareness. Handlers that set one of two signals based on a condition (`if (isControlled()) { setA() } else { setB() }`) are reported as batch candidates even though only one setter fires per interaction. This is a known false positive documented in tests. A fix requires AST-level control flow analysis (v2 scope). The finding message now includes `(static; verify setters are not in separate if/else branches)` to help users self-triage.

- 4ccc227: Add `bf debug profile` — reactive performance profiler (#1690), static half.

  New CLI subcommand `bf debug profile <component>` prints a per-component static
  reactivity budget (no run required): signal/memo/effect/loop counts, total
  subscriptions, the longest memo→memo chain, and per-signal fan-out with a `hot`
  threshold. `--diff <ref>` compiles the component at a git ref and flags
  structural reactivity regressions (CI-able, exits non-zero on growth). Human
  table and `--json` output, consistent with the `bf debug *` family.

  `@barefootjs/jsx` gains the supporting static-analysis API: `buildStaticBudget`,
  `diffStaticBudget`, `formatStaticBudget`, `formatBudgetDiff`, and the
  `buildProfileReport` seam for the dynamic (scenario-driven) half specified in
  `spec/profiler.md`.

- 8058e18: `bf debug profile <component> --scenario auto` now reaches compound / child-component handlers (#1690, closes #1796).

  Auto mode previously compiled only the target's own file. For a compound
  component whose interactive handler lives in a separately-registered child
  (`<Collapsible><CollapsibleTrigger/>…`), the child was never compiled, so it
  never registered, the mount couldn't wire it, and handler discovery read
  `0 turns, 0/0 handlers` even though the composition has handlers.

  Auto mode now walks the target's local (relative) import graph — the same
  dependency-first resolution the `--scenario <story.tsx>` path already used —
  so every child component registers via `hydrate(...)` before the root mounts,
  its handlers enter the discovery set, and the toggle/click fires through the
  composition. No story file required.

- aafbccc: Wire `bf debug profile <component> --scenario auto` — the dynamic run (#1690).

  The CLI now mounts a component's instrumented build in happy-dom, fires each
  interactive element once, and prints the joined report (hot subscribers + batch
  advisor + coverage). `buildProfileReport(input)` becomes a real pure function
  (graph + SR4 join + analyses → ranked findings) and `formatProfileReport`
  renders it; `@barefootjs/jsx` now also exports the analysis functions and the
  dependency-free `testAdapter` for tooling.

  Also fixes a real bug found while dogfooding: the **multi-component** compile
  path did not thread `options.profile` to `generateClientJs`, so profile-mode
  ids were silently dropped for any file exporting more than one component. Now
  threaded — single- and multi-component files both emit ids (profile-off output
  is unchanged).

  happy-dom is a CLI devDependency, imported lazily so the static modes
  (`bf debug profile <component>` / `--diff`) carry no DOM cost.

- 3038728: Add scenario-file support to `bf debug profile` (#1690, #1796).

  `bf debug profile <component> --scenario <story.tsx>` now compiles a "story"
  file and its local relative imports, mounts the composition, and fires every
  handler — so a component composed from sub-components (the common case) is
  profiled as it's actually used, not as a bare mount.

  - driver: `loadStory` resolves the story's relative imports (dependency-first);
    `runScenario` compiles each in profile mode, dedupes the concatenated runtime
    imports into one, mounts the story, and fires all IR-known handlers across
    every component in every source.
  - jsx: `buildProfileReport` accepts `extraSources` and enumerates every
    component per source (`listComponentFunctions`), merging their id indexes and
    handler bindings — so events from composed sub-components resolve and the
    safety oracle reasons over the right component's graph.

  Verified end-to-end: a story composing `Switch` reports `1/1` coverage with its
  memos, attribute bindings, and controlled-signal effect source-mapped. Fully
  headless components whose handlers/bindings are wired through context remain
  limited by analyzer binding-coverage (the same gap as #1795), tracked on #1796.

### Patch Changes

- dd3213a: fix(profile): never truncate `hotSubscribers` in `--json` mode (#1849 B1)

  `--top N` is a display cap on the dynamic hot-subscribers table; `--json` is documented as never truncated. The profile command now skips the slice in JSON mode so the serialized subscriber list is complete.

- 5c54182: fix(profile): actionable error for external `@barefootjs/client` imports under `--scenario auto` (#1849 B3)

  When a component depends on an external `@barefootjs` package whose compiled output imports `@barefootjs/client` directly (e.g. the cached `@barefootjs/xyflow` build), `--scenario auto` now explains the failure and points at a pre-bundled `--scenario <story.tsx>` or the static budget, instead of surfacing a raw module-resolution stack.

- fa239fe: fix(profile): reject `--scenario` combined with `--diff` (#1849 B4)

  `--scenario` (measure a run) and `--diff` (compare two compiles) are mutually exclusive modes. Combining them previously ran the scenario and silently dropped `--diff`; it now errors up front with an explanatory message.

- 5d6a7ab: fix(profile): resolve preview-only components via `index.preview.tsx` (#1849 B5)

  A monorepo component directory that ships only `index.preview.tsx` (no `index.tsx`, e.g. `settings-form`) now resolves to the preview — noted on stderr, never polluting `--json` stdout — instead of erroring with "Cannot find component". `index.tsx` still wins when both exist.

- de14a0a: fix(profile): stop git stderr leaking on a bad `--diff` ref (#1849 B8)

  `readFileAtRef` now captures git's stderr (`stdio: pipe`) and folds its message into a single CLI error line, instead of letting git's raw `fatal: invalid object name …` leak ahead of the CLI's own message.

- 0faeb51: fix(profile): detect external `@barefootjs/*` runtime imports before the run (#1849 B3 follow-up)

  `bf debug profile chart --scenario auto` leaked a raw `Cannot find module
'@barefootjs/client/runtime'` stack: the cached `@barefootjs/chart` /
  `@barefootjs/xyflow` dists import the client runtime directly, which the
  import-rewriting pass can't reach inside an external bundle.

  Detection now happens _pre-flight_ against the driver's own compiled client JS
  (`externalRuntimeImport`): any `@barefootjs/*` import the compiler leaves in the
  emitted client JS other than the handled `@barefootjs/client[/...]` /
  `@barefootjs/jsx[/...]` families is an un-rewritable external runtime package, so
  the run is skipped with an actionable message that names the offending package
  and points at `--scenario <story.tsx>` or the static budget. This replaces the
  previous error-message classifier, which matched bun's resolution stack text and
  was fragile to bun version and importer-path formatting.

- e9f724d: Auto-scenario fires every IR-known handler, not just buttons (#1690, #1796).

  `bf debug profile --scenario auto` now drives interactions from the component
  graph: for each `event` domBinding it dispatches the right event
  (`MouseEvent`/`KeyboardEvent`/`Event`) on each `[bf="<slotId>"]` element —
  including **delegated list-item handlers** and branch handlers — falling back to
  the button/link sweep only when nothing resolves.

  A list component whose only interaction is `<li onClick>` now reports
  `coverage: N/N` and measures the row toggle, where before it read `0` turns.

- ce2ea33: `bf debug profile --scenario auto` now attributes imported child components and quiets runtime-bookkeeping coverage noise (#1840).

  Two related attribution/coverage fixes:

  - **Imported child sources reach the id index.** Auto mode loaded a target's
    local imports to drive the run, but did not pass them into
    `buildProfileReport`, so events from composed children (e.g. `DatePicker`
    importing `Calendar`) resolved to `((unresolved))`. Auto mode now forwards
    those imported sources the same way the `--scenario <story.tsx>` path does,
    so `Calendar#binding:*` subscribers map back to their source location.

  - **Anonymous runtime ids no longer masquerade as coverage gaps.** The reactive
    runtime assigns fallback `s<n>`/`e<n>`/`m<n>`/`r<n>` ids to nodes with no
    compiler `__bfId`. These can never map to a source node, so reporting them as
    `coverage.unattributed` made healthy reports look broken. `joinProfilerEvents`
    now routes them to a separate non-actionable `diagnostics` bucket (surfaced,
    never dropped), leaving `unattributed` for actionable gaps only.

- c30e089: Profiler CLI ergonomics: robust flags + actionable build hint (#1690).

  Dogfooding `bf debug profile` surfaced three agent-facing rough edges:

  - **Flags leaked into the component name.** Unknown / mis-typed flags were
    pushed onto the positional list, so `bf debug profile --hot-ms 10 foo` read
    `--hot-ms` as the component and failed with `Cannot find component
"--hot-ms"`. `parseFlags` now rejects unknown `--flags` and validates numeric
    ones with an actionable message + usage, instead of silently mis-parsing.
  - **`--top` / `--hot-ms` are now wired.** `--top <n>` caps the hot-subscriber
    list (the `--json` set is unchanged); `--hot-ms <n>` drops sub-threshold
    subscribers so a grid component's long tail collapses to what is worth a fix.
    Threaded through `buildProfileReport` → `analyzeHotSubscribers` (new
    `minMs` option).
  - **Opaque "Cannot find module" on a fresh checkout.** The dynamic profiler
    imports the built client runtime (`@barefootjs/client/runtime`), so a checkout
    that ran `bun install` but not `bun run build` failed here with a raw module
    error. The scenario driver now catches it and points at `bun run build`,
    noting the static budget needs no build.

- f6d497d: Profiler dogfooding fixes: resilient mount + capped report (#1690).

  Sweeping `--scenario auto` across the UI library surfaced two rough edges:

  - **Crash on context-dependent components.** A bare mount of a component whose
    init reads a context provider (e.g. `sidebar`'s `ctx.state`) threw an
    uncaught `TypeError`, aborting `bf debug profile`. The driver now catches the
    mount failure and reports an actionable message ("…needs a context provider
    or composition — profile it with `--scenario <story.tsx>`").
  - **Unreadable hot list.** A grid component (e.g. `calendar`) produced 1000+
    subscribers, dumping a thousand rows. `formatHotSubscribers` now shows the top
    N (default 12) and summarizes the rest as "… and N more", keeping the report
    scannable (the full set remains in `--json`).

- e743370: Profiler onboarding: a thorough `bf debug profile --help`, and remove the
  standalone spec doc (#1690).

  The design doc at `spec/profiler.md` had started to drift from the shipped
  behavior, so it is removed and the CLI help becomes the single source of truth.
  `bf debug profile --help` (and `-h`) now prints a self-contained guide: the
  three modes (static budget / `--diff` regression / `--scenario` measured run),
  how to read each section of a dynamic run (hot subscribers, wasted re-runs,
  batch advisor, coverage), every flag with its default, examples, and the
  build/dev-only notes. The top-level `bf --help` line now surfaces `--scenario`
  and points at the dedicated help. In-code comments that referenced the removed
  spec file were updated to stand on their own (pointing at issue #1690).

- 1919a0c: Add the wasted-re-runs analysis — v1 (#1690, §4.2.2).

  A reactive effect/memo that re-ran but produced output identical to its
  previous run did removable work — the complement to hot subscribers (where the
  cost is, vs. how much of it is removable).

  - **Fingerprint (SR1, dev-only/SR8):** new optional `effectOutput(id, changed)`
    sink method on the SR2 stream. The runtime aggregates a per-run output verdict
    via `__bfReportOutput` (flushed once at run exit): memos compare the recomputed
    value by `Object.is`; text bindings (`__bfText`) compare the written string —
    and a stale-element cleanup counts as a real DOM change. A run with no
    fingerprint emits no event and isn't counted. `effectOutput` is optional on the
    exported `ProfilerEventSink`, so a pre-existing custom sink stays valid.
  - **Analysis (SR2 + SR4):** `analyzeWastedReReruns` / `formatWastedReReruns`,
    `wasted = wastedRuns / totalRuns`, joined to IR source loc and ranked by
    removable cost then ratio (deterministic). Surfaced in `buildProfileReport` /
    `formatProfileReport` (text + `--json`) behind the new `--wasted-pct` flag
    (default 50%).

- Updated dependencies [c26b408]
- Updated dependencies [271350a]
- Updated dependencies [b5067dc]
- Updated dependencies [9877323]
- Updated dependencies [07b95ad]
- Updated dependencies [7079ca0]
- Updated dependencies [1919a0c]
  - @barefootjs/client@0.11.0
  - @barefootjs/shared@0.11.0

## 0.10.1

### Patch Changes

- a62612b: Fix SSR render crash for components whose signal/memo reads an optional prop (`createSignal(props.initial ?? 0)`). The bare-props-arg form now seeds those referenced props into the manifest `ssrDefaults`, so template-stash adapters no longer abort with `Global symbol "$initial" requires explicit package name` at top-level render. The Text::Xslate scaffold's `app.psgi` also seeds each component's `ssrDefaults` from the build manifest (a plain PSGI app has no plugin to do it automatically), so `<: $count :>` and friends resolve.

## 0.10.0

### Minor Changes

- 8e60a7a: create-barefootjs: install the Mojolicious scaffold's BarefootJS deps from CPAN (declared in `cpanfile` via `Mojolicious::Plugin::BarefootJS` + `BarefootJS`) instead of vendoring `.pm` copies under `lib/`, and add a new `xslate` adapter (`--adapter xslate`) that scaffolds a plain Plack/PSGI app rendering Kolon `.tx` templates through `BarefootJS::Backend::Xslate`.

## 0.9.6

## 0.9.5

## 0.9.4

## 0.9.3

## 0.9.2

### Patch Changes

- 9a4f49f: Fix Deno one-shot command hints and adopt `deno x`. `commandsFor('deno').exec` now emits `deno x npm:<pkg>` (Deno 2.6+, the `npx` equivalent that defaults to `--allow-all`) instead of `deno run -A npm:<pkg>`. Generated Deno project scripts (e.g. `wrangler dev`/`deploy`) therefore use `deno x` and now require Deno 2.6+.

  Component install snippets are also corrected to reference the published package `@barefootjs/cli` rather than the bare bin name `bf` — the latter resolves to an unrelated npm package when run cold (outside a project that already has the CLI installed).

## 0.9.1

## 0.9.0

### Minor Changes

- c7a38ec: Support Deno as a package manager. `detectPackageManager` now recognises Deno projects (`deno.lock` / `deno.json` / `deno.jsonc`, or the Deno runtime via `process.versions.deno`), and `commandsFor('deno')` emits the `deno install` / `deno task` / `deno run -A npm:…` shapes. The published CLI bundle now imports Node builtins through the `node:` specifier so it loads under Deno as well as Node and Bun.

### Patch Changes

- 7be78dd: Fix non-deterministic Go type ordering when building under Bun.

  `discoverComponentFiles` relied on the OS `readdir` order, which differs between runtimes: Bun returns APFS hash order while Node.js returns alphabetical order. This caused Go integrations' `components.go` to regenerate with a different type/function ordering on every build even when no source files changed.

  Sort entries in `discoverComponentFiles` by name so the component processing order is always alphabetical, regardless of JS runtime or filesystem.

## 0.8.0

## 0.7.0

### Minor Changes

- e6b0428: Add Gin, Chi, and net/http (Go standard library) adapters to `bf init`,
  alongside the existing Echo adapter. Each scaffolds a runnable
  html/template SSR app with the BarefootJS runtime vendored under
  `./bf-runtime` (now including the `bfdev` subpackage for SSE dev
  auto-reload).
- 1c9e5bf: Go runtime: `bf.Renderer.Render` now backfills a unique `ScopeID` for
  child components (slice and single) whose `ScopeID` was left empty,
  deriving the `<Component>_<random>` prefix from the props type. This
  lets application handlers build child props without minting scope ids by
  hand (e.g. `TodoItemProps{Todo: t}` instead of
  `TodoItemProps{ScopeID: ..., Todo: t}`). Explicit `ScopeID` values are
  preserved. Shipped with the vendored runtime in `bf init` scaffolds.

### Patch Changes

- 27bb9e6: Stop pushing the Bun runtime onto users who didn't pick it.

  - CSR starter: the scaffold's `server.ts` now runs on plain `node:http` +
    `node:fs` (launched via `tsx`, matching the hono-node starter) instead of
    `Bun.serve` / `Bun.file`, so npm / pnpm / yarn users are no longer forced
    to install Bun. Scripts use `tsx`, deps use `@types/node` + `tsx` instead
    of `@types/bun`, and the Bun-on-PATH prerequisite warning is gone. The
    server still runs unchanged under Bun or Deno.
  - Mojolicious / Go (Echo, Gin, Chi, net/http) starters: prerequisite
    warnings and the generated server's "did you run the build?" hint no
    longer hardcode `bun run dev` / `bun run build` — they're now PM-neutral
    (`bf build`, "before starting the dev server"), since these strings are
    shown to every user regardless of their package manager.

## 0.6.1

## 0.6.0

## 0.5.3

### Patch Changes

- f122f64: Fix the Hono (Node) scaffold's `tsconfig.json` excluding `dist/components`, where `bf build` writes the compiled SSR templates the server imports via the `@/components/*` path mapping. `tsx` applies the JSX transform per-file and honours tsconfig `include`/`exclude`, so an excluded `.tsx` lost `jsxImportSource: "@barefootjs/hono/jsx"` and fell back to the classic React runtime — the first SSR render threw `ReferenceError: React is not defined` and every page 500'd. The compiled templates now stay in transform scope. The Cloudflare/wrangler `hono` scaffold is unaffected (wrangler's esbuild applies the JSX option globally during bundling).
- 72fdbe2: `bf build` no longer mangles string-literal contents when inlining a local module into a client component's chunk. The combine and specifier-normalisation passes are now AST-aware, so `import …` lines and `@barefootjs/client` text that merely appear _inside a string value_ (e.g. an inlined data module exporting a code snippet) are left untouched. This fixes a hydration break (`ReferenceError: hydrate is not defined`, where the component's real runtime import was relocated into the literal) and a string-corruption bug (`@barefootjs/client` rewritten to `./barefoot.js` inside snippet text).

## 0.5.2

## 0.5.1

## 0.5.0

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

### Minor Changes

- 085e3d4: `bf build` now maintains a `.assetsignore` in `outDir` for Cloudflare Workers projects so `wrangler deploy` no longer uploads server/build-only outputs (SSR `.tsx` templates, `manifest.json`, `barefoot-externals.json`, `.bfemit.json`, `.buildcache.json`, `.dev/`) as public assets. It's only written when a wrangler config is detected next to `barefoot.config.ts`, and barefoot only owns a marked block — user entries are preserved across rebuilds.

### Patch Changes

- bb5cfc1: externals: stop the false-positive "not browser-ready" warning for chunks whose only unresolved imports are the always-importmap-resolved `@barefootjs/client*` dedup keys, and make `rebundle: true` pass those peers (and other configured externals) as `external` to esbuild so the shared reactive runtime is no longer inlined into the chunk (#1646).

## 0.3.0

### Minor Changes

- 0111b70: Add source locations/JSX previews to DOM bindings, `bf debug loops`, `bf debug why-update`, `bf debug summary` commands, and improved `bf debug fallbacks` output
- 215fa25: Move the preview tool into `@barefootjs/cli` and rewrite it as a compiler-based CSR build. `bf preview <component>` compiles the component (and its deps) to client JS and bundles a browser preview that renders via `@barefootjs/client`'s `render()` — full reactivity for stateful components, no SSR server. The standalone `@barefootjs/preview` package is removed; preview now ships with the CLI (no Hono, no separate install).

  Preview only compiles the previewed component's transitive dependency closure instead of the whole component registry, cutting a single-component build from ~26s to ~7s. New flags: `--serve` starts a built-in static server (no more separate `npx serve` step), and `--watch` rebuilds on source changes with live reload (`--port` to choose the port).

  `bf preview` now runs under Node (no Bun required) and works in end-user projects, not just the monorepo. Design tokens, `globals.css` and the UnoCSS config are resolved per-environment — your project's own files when present, otherwise defaults bundled with the CLI — so `bf add`-ed components preview with zero setup while respecting a project's own theme. Requires `unocss` and `@barefootjs/client` to be installed in the project (a clear message is shown if either is missing).

### Patch Changes

- 4e4c5a6: Improve `bf gen preview` output quality: wrap multi-root previews in a Fragment (`<>…</>`), resolve `XxxIcon` tags to `../icon`, import sub-components that share the parent's name prefix (e.g. `TypographyH1`) from the parent module instead of a guessed path, merge same-module imports onto one line, and include digits in the tag-name regex so names like `TypographyH1` aren't truncated.

## 0.2.0

### Minor Changes

- 4e4d31a: Add `bf debug events` command for tracing event handler -> setter -> signal -> DOM update paths

### Patch Changes

- 57262dd: Move @barefootjs/cli from dependencies to devDependencies in generated package.json. The CLI is a build tool, not a runtime dependency.

## 0.1.3

### Patch Changes

- 3335b89: Add block-level `<Tabs>`/`<Tab>` support to the MDX-lite parser and Tabs projector for adapter code tabs

## 0.1.2

### Patch Changes

- 6b567a9: Fix scaffold tsconfig paths order in Hono adapters so wrangler resolves compiled SSR templates (with hydration markers and script collection) instead of raw `'use client'` source files. Also bump vitest from `^2.0.0` to `^4.0.0` for npm/pnpm/yarn scaffolds to resolve esbuild vulnerability (GHSA-67mh-4wv8-2f99).

## 0.1.1

### Patch Changes

- c896b8b: Fix published packages: resolve workspace:\* and point exports to dist/
