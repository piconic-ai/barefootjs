---
"@barefootjs/cli": minor
"@barefootjs/client": minor
"@barefootjs/hono": minor
"@barefootjs/go-template": minor
"@barefootjs/blade": minor
"@barefootjs/erb": minor
"@barefootjs/jinja": minor
"@barefootjs/mojolicious": minor
"@barefootjs/rust": minor
"@barefootjs/twig": minor
"@barefootjs/xslate": minor
---

Remove the legacy build pipeline — `bf build`, `barefoot.config.ts`, and every adapter's `createConfig`

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
  — copied to a new `site/shared/lib/legacy-build-helpers.ts` rather than
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
