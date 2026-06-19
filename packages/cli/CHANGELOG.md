# @barefootjs/cli

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
