# @barefootjs/cli

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
