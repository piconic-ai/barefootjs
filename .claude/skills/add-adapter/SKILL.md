---
name: add-adapter
description: "Playbook for adding a new BarefootJS template adapter package (IR → target template language + native runtime). Use when: adding an adapter for a new template engine or backend language, porting the bf helpers / ParsedExpr evaluator to a new language, or wiring an adapter into conformance, compat, CI, release, and docs."
metadata:
  short-description: "Add a new BarefootJS adapter end-to-end"
---
# Add a New Adapter

This is the end-to-end playbook for adding a `packages/adapter-<name>` package. It exists
because the task is long (a full adapter lands ~30 files, ~6k lines) and the failure mode is
predictable: writing lots of adapter code before the conformance loop is running, or finishing
the package but missing the repo-wide integration points. Follow the phases **in order** — each
one ends with something that compiles and a test loop that stays green.

## Read first (in this order, before writing any code)

1. `spec/compiler.md` — "Adapter API" and "Implementing a New Adapter" sections (the
   `TemplateAdapter` contract, `TemplateSections`, per-kind emitter pattern, capability flags).
2. `spec/adapter-architecture.md` — the constitution: IR carries semantics, adapters never
   parse/regex expression strings, thin adapter object + pure domain modules over `EmitContext`.
3. `docs/core/adapters/custom-adapter.md` — step-by-step coding walkthrough of each render method.
4. `spec/template-helpers.md` — the `bf` helper catalogue the native runtime must implement.
5. Skim the newest comparable adapter's initial commit for the authoritative file list:
   `git log --oneline --grep 'adapter' -- packages/adapter-blade packages/adapter-rust`
   (e.g. `9da1880` blade, `0e6aeeb` rust — both land nearly self-contained in one package).

## Phase 0 — Scoping decisions (write these down before coding)

Pick the closest existing adapter and copy its skeleton; do not design from scratch:

| Target runtime | Copy from | Base class |
|---|---|---|
| Full JS engine template (can run JS at SSR) | `packages/adapter-hono` | `JsxAdapter` |
| String-template DSL, compiled language | `packages/adapter-go-template`, `adapter-rust` | `BaseAdapter` |
| String-template DSL, dynamic language | `packages/adapter-erb`, `adapter-jinja`, `adapter-twig`, `adapter-blade` | `BaseAdapter` |
| Perl family | `packages/adapter-mojolicious`, `adapter-xslate`, `adapter-perl` | `BaseAdapter` |

Decide and record:
- **Runtime model**: JS-engine (`clientShimSource`, `acceptsTemplateCall`) vs DSL
  (`templatePrimitives` map only, both others `undefined`).
- **`importMapInjection`**: `'html-snippet'` for DSL/string-template targets, `'component'` for
  JS-runtime targets. Required for shipping adapters (#1644).
- **`templatesPerComponent`** and the template file `extension`.
- **Where the native runtime lives**: in-package (like `adapter-erb/lib`, `adapter-go-template/runtime`)
  or shared with a sibling (like blade reusing `adapter-php`'s runtime).
- **Helper naming convention** for lowering-node dispatch (`bf_*` Go, `bf->*` Perl/Mojo,
  `$bf.*` Xslate, `bf.*` Ruby/Jinja-family) — stay consistent with the language's idiom.

## Phase 1 — Package skeleton (compiles, empty adapter)

Create `packages/adapter-<name>/` by copying the chosen reference. The invariant shape:

```
package.json          # exports: "." , "./adapter" (src), "./build", "./test-render" ("bun" condition ONLY)
tsconfig.json
src/index.ts          # re-exports adapter + conformancePins
src/build.ts          # createConfig() consumed by the user's barefoot.config.ts (bf build has NO registry)
src/conformance-pins.ts  # ConformancePins — per-fixture BF101/BF103 refusals (also consumed by bf compat)
src/test-render.ts    # spawns the REAL backend toolchain; Bun-only, behind the "bun" export condition
src/__tests__/<name>-adapter.test.ts  # the single runAdapterConformanceTests(...) call
src/adapter/
  <name>-adapter.ts   # thin orchestrator: TemplateAdapter impl, CompileState, dispatch methods
  emit-context.ts     # the seam domain modules depend on (never the concrete class)
  analysis/component-tree.ts
  expr/{emitters,array-method,operand}.ts   # ParsedExpr → target language
  lib/{constants,ir-scope,<lang>-naming,types}.ts
  memo/seed.ts        props/…  spread/spread-codegen.ts  value/…
<native runtime dir>  # lib/ (gem), runtime/ (go module), php/, … with its own tests
```

The workspace glob (`packages/*`) picks the package up automatically. Deps: `@barefootjs/shared`
as dependency, `@barefootjs/jsx` as peer + dev, `@barefootjs/adapter-tests` as dev.

**Checkpoint**: `bun install && tsgo --noEmit -p packages/adapter-<name>` passes.

## Phase 2 — Adapter core

Implement `TemplateAdapter` (`packages/jsx/src/adapters/interface.ts`). Non-negotiables:

- **Emit via the shared dispatchers** — implement `ParsedExprEmitter` / `IRNodeEmitter<Ctx>` /
  `AttrValueEmitter` visitor interfaces. Never write your own `switch (kind)` with a permissive
  `default`: the shared dispatchers' `assertNever` is the drift-defence that turns a new IR kind
  into a compile error in your adapter.
- **No expression parsing.** `parseExpression`, `ts.createSourceFile`, and regex over expression
  strings are forbidden in adapter code — the IR supplies `ParsedExpr` (`MemoInfo.parsed`,
  `IRExpression.parsed`, `parsedCondition`, `ExpressionAttr.parsed`). If a field you need isn't
  carried yet, extend the shared layer per "How to add a unit" in `spec/adapter-architecture.md`.
- **Sections, not post-processing**: return `AdapterOutput.sections` (`imports/types/component/
  defaultExport/moduleConstants`); the compiler concatenates and never parses your template.
- **Hydration markers**: `renderScopeMarker` / `renderSlotMarker` / `renderCondMarker` emit
  `bf-s` / `bf` / `bf-c`; the marker-conformance suite asserts the ids match the IR's.
- **Lowering nodes** (`packages/jsx/src/lowering-registry.ts`): in `generate()` bind matchers once
  with `prepareLoweringMatchers(ir.metadata)` and store them in `CompileState`. When lowering a
  call, try the matchers; render a `LoweringNode` with one renderer per node kind, **dispatching on
  the `helper` id** (guarded by `isValidHelperId`) mapped to your runtime naming (e.g. `query` →
  `bf_query`). Reference: `packages/adapter-go-template/src/adapter/expr/url-builder.ts`. Never
  render an unmapped helper verbatim, and never special-case a built-in like `queryHref` outside
  this path (see CLAUDE.md "Structural lowering registration").
- Keep the object thin: per-compile state in `CompileState` reset per `generate()`, logic in pure
  functions over `emit-context.ts`, stateless helpers in `lib/`.

**Checkpoint**: the simplest shared fixture compiles to a plausible template (drive it from a
scratch test before wiring the full suite).

## Phase 3 — Native runtime + golden vectors

The target language needs a runtime package shipping:
- The `bf` **template helpers** per `spec/template-helpers.md` (incl. the `query` helper matching
  client `queryHref` semantics exactly — guards, emptiness, array append).
- A **ParsedExpr evaluator** porting `packages/adapter-tests/vectors/eval-reference.ts` semantics.
- **Golden-vector replay tests** in the target language for both
  `packages/adapter-tests/vectors/vectors.json` and `eval-vectors.json`, plus a hand-maintained
  `vector-divergences.json` in your package (auto-discovered by
  `packages/adapter-tests/src/__tests__/divergences.test.ts` — and note its `EXPECTED_BACKENDS`
  list must gain your language).
- Dev-reload support if the scaffold story needs it (pattern: `lib/barefoot_js/dev_reload.rb`,
  `runtime/bfdev/`).

Follow `packages/adapter-tests/vectors/README.md` "Adding a new backend".

**Checkpoint**: native-language test suite green locally (skip gracefully when the toolchain is
missing — see `onRenderError` in existing conformance tests).

## Phase 4 — The conformance loop (this is most of the work)

Wire `runAdapterConformanceTests` (`packages/adapter-tests/src/run-adapter-conformance.ts`) in
your `src/__tests__/` with: `name`, `factory`, `render` (your `test-render.ts` spawning the real
backend), `onRenderError`, `expectedDiagnostics: conformancePins`, and initially-broad `skipJsx`.

Then iterate: **pick one failing fixture at a time**, make it pass, shrink the skip list, commit.
~190 shared fixtures exist; do not try to clear them in one pass and do not edit shared fixtures
to fit your adapter. Rules for what remains skipped/pinned at the end:
- A **genuine capability refusal** (target language can't express it) becomes an
  `expectedDiagnostics` pin in `conformance-pins.ts`, with a docstring pointing at a
  [`known-limitation`](https://github.com/piconic-ai/barefootjs/labels/known-limitation) issue URL.
- `skipJsx` / `skipTemplatePrimitives` / `skipMarkerConformance` entries likewise each carry an
  issue pointer. An unexplained skip is a review blocker.

Also verify: `no-bun-coupling.test.ts` (published sources Bun-free except the `"bun"`-gated
`./test-render`), marker conformance, and the CSR conformance suite (adapter-independent — you
should never need to touch `csr-conformance.test.ts`).

**Checkpoint**: `bun test packages/adapter-<name>` and `bun test packages/adapter-tests` green;
`tsgo --noEmit` and `bun run lint` (biome) clean.

## Phase 5 — Repo integration checklist (every line, in this order)

The initial package commit is nearly self-contained, but these cross-cutting registrations are
easy to miss — check off each one:

- [ ] `packages/adapter-tests/src/__tests__/divergences.test.ts` — add the language to
      `EXPECTED_BACKENDS` (only if this is a new backend language).
- [ ] `packages/adapter-tests/src/__tests__/import-map-injection.contract.test.ts` — add the
      adapter to `ADAPTERS`.
- [ ] `packages/compat/src/adapter-registry.ts` — add `{ pkg, className }` to `COMPAT_ADAPTERS`
      (the ONE enumeration of TemplateAdapter packages); add the workspace devDependency in
      `packages/compat/package.json`; regenerate `ui/compat.lock.json` via `bun run compat:lock`
      (CI fails on drift).
- [ ] `scripts/changeset-publish.ts` — insert the package in the ordered publish list.
- [ ] `.github/workflows/ci-<name>.yml` — new workflow, path-filtered on
      `packages/{client,shared,jsx,adapter-<name>,adapter-tests}/**`, installing the language
      toolchain, running native runtime tests then `bun test packages/adapter-<name>`
      (copy the closest `ci-*.yml`).
- [ ] `.github/workflows/release.yml` — per-language registry publish job (gem/crates/PyPI/CPAN/
      Packagist…), following the existing Trusted-Publishing patterns.
- [ ] Add a changeset (`.changeset/`) — CI enforces it.
- [ ] Optional, separate PRs: `bf init` scaffold (`ADAPTERS` map in
      `packages/cli/src/lib/templates.ts` + `packages/cli/src/lib/adapters/<name>.ts` +
      scaffold/dev-reload contract tests), an `integrations/<framework>/` example app
      (+ `integrations/README.md`, `docker-compose.yml` mounts), site landing demo backends
      (`site/core/landing/generate-demo-outputs.ts` `BACKENDS` — every demo must compile there).

## Phase 6 — Docs

- [ ] `docs/core/adapters.md` — "Available Adapters" table, runtime-model paragraph, "Pages" table.
- [ ] New `docs/core/adapters/<lang>-adapter.md` page (pattern: `ruby-adapter.md`).
- [ ] `spec/compiler.md` — "Available Adapters" list.
- [ ] `spec/template-helpers.md` — helper naming column, if a new convention.
- [ ] `packages/adapter-tests/vectors/README.md` — runners table.
- [ ] `CLAUDE.md` — Architecture adapter list.
- [ ] `docs/core/llms.txt` index.

## Working discipline (how to run this as a long task)

- **One phase per commit (minimum).** Within Phase 4, commit every time the skip list shrinks.
  Each commit message states which fixtures went green.
- **Keep a scratch checklist** of the Phase 5/6 boxes from the start; tick them as you go rather
  than reconstructing at the end.
- **Verify with the suite, not by eye**: the conformance runner comparing against the reference
  adapter's frozen snapshots is the ground truth. When output differs, diff the emitted template
  against the closest sibling adapter's output for the same fixture before touching code.
- **When blocked on a fixture**: check the
  [`known-limitation`](https://github.com/piconic-ai/barefootjs/labels/known-limitation) label
  first — a sibling adapter may already have pinned the same case; mirror its pin and issue link.
- **Never** edit shared fixtures, frozen snapshots, or the shared dispatchers to make your
  adapter pass; if the shared layer genuinely needs a new IR-carried field, that is its own
  stacked, byte-identical-for-existing-adapters PR (spec/adapter-architecture.md "How to add a unit").
- Final gate before the PR: `bun run build`, `bun test`, `tsgo --noEmit`, `bun run lint`,
  `bun run compat:lock` drift check, and re-read this checklist top to bottom.

## Kickoff prompt template

Paste this (filled in) to start the task in a fresh session:

```
Add a new BarefootJS adapter for <TEMPLATE ENGINE / LANGUAGE> as packages/adapter-<name>.

Follow .claude/skills/add-adapter/SKILL.md exactly, phase by phase — read its "Read first"
list before writing code. Scoping answers: runtime model = <DSL | JS-engine>; copy skeleton
from packages/adapter-<closest>; native runtime lives <in-package | shared with X>; helper
naming = <bf_* | bf.* | …>; importMapInjection = <html-snippet | component>.

Work in small commits: package skeleton first, then the adapter core, then the native runtime
with golden-vector replay, then grind the conformance suite one fixture at a time (skip list
shrinks every commit; every surviving skip/pin carries a known-limitation issue URL). Finish
with the Phase 5 integration checklist and Phase 6 docs — every box, none skipped. Do not edit
shared fixtures, snapshots, or dispatchers. Gate on: bun run build, bun test, tsgo --noEmit,
bun run lint, bun run compat:lock.
```
