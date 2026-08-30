# BarefootJS

JSX → Marked Template + client JS compiler. Signal-based reactivity for any backend.

## Project Setup / Tech Stack

This project primarily uses TypeScript with Go template adapters. Use `bun` instead of `npm` for package management. For CSS, use UnoCSS — note that UnoCSS alpha modifiers do not work with CSS variables, and files must be explicitly included in UnoCSS scanning config.

## Architecture

2-phase compilation: JSX → IR → Marked Template + Client JS.

- `packages/jsx/src/` — Core compiler. Key files: `jsx-to-ir.ts` (Phase 1), `ir-to-client-js.ts` (Phase 2), `analyzer.ts` (reactivity analysis).
- `packages/client/src/` — Client runtime (`createSignal`, `createEffect`, etc.) with DOM runtime under `./runtime`.
- Adapters: `packages/adapter-hono/` (Hono/JSX), `packages/adapter-go-template/` (Go `html/template`), `packages/adapter-erb/` (Ruby ERB).

See `spec/compiler.md` for the full pipeline architecture, IR schema, transformation rules, adapter interface, and error codes.

## Code Conventions

- **Never parse imports (or any JS/TS syntax) with regex or string matching.** Regexes false-match inside string/template literals and comments, and miss multi-line clauses, trailing commas, and `import type`. Use the established structural patterns instead:
  - **Source files (.tsx/.ts)**: the IR's parsed metadata (`ir.metadata.imports`, built by the analyzer's TS AST walk — see `collectImport` in `packages/jsx/src/analyzer.ts`).
  - **Compiled client JS**: a TS AST walk over top-level statements (`ts.isImportDeclaration` + span-based splicing). Precedent: `packages/jsx/src/combine-client-js.ts` (the deleted `packages/cli/src/lib/resolve-imports.ts` was migrated from regex to AST for exactly this reason before the sites moved onto `@barefootjs/vite` and it went away).
  - Do not add a second parsing library (e.g. es-module-lexer) — `typescript` is already a direct dependency and the AST walk is the repo-wide idiom.
- **Never carry mixed content (JS text + JSX) through the compiler as sentinel-bearing strings, and never splice raw source text into emitted artifacts untyped.** This is the write-side twin of the parse rule above: strings are not structure on the way out either. A placeholder convention (`__BF_JSX_N__`-style) distributes a substitution obligation across every emitter — each consumer that doesn't know the convention is a silent leak (raw JSX in the client bundle; the Stage-3 preamble holes closed by the root-cure PR). Instead: carry mixed content as **structured IR** (see `MapCallbackPreamble` segments, `packages/jsx/src/types.ts`) rendered through a **single door** (`renderPreamble`, `packages/jsx/src/ir-to-client-js/html-template.ts`), and **brand** raw source text by its only legal destination (`TsxSourceText` for JSX-runtime SSR adapters) so misuse is a type error. Emitters that can't host the content declare it (`rowConstruction` on loop plan variants) and the dispatcher refuses loudly. The mechanical backstop is `map-body-no-silent-divergence.test.ts` (every `.map()` body shape must be sound-or-loud; its known-hole set is empty and may only shrink).
- **Never add compiler options/hooks for tool-specific output rewriting** (e.g. a rewrite callback on `CompileOptions`). Once such a hook exists it reads as a sanctioned extension point and accretes callers. Tools that need to adjust emitted client JS post-process it themselves with the TS AST walk above; an extra `ts.createSourceFile` parse is acceptable off the build hot path (e.g. `bf debug profile`), not in `bf build`.
  - **Structural lowering registration is NOT this** and is allowed: the `LoweringPlugin` registry (`registerLoweringPlugin` in `packages/jsx/src/lowering-registry.ts`, #2057) lets a package recognize a call and return a **backend-neutral `LoweringNode`** — a structured IR node, never a rewritten output string. Each adapter renders the node in its own syntax, so SSR/CSR parity is enforced once (in the neutral layer), not per plugin. Everything flows through this one registry — userland plugins AND first-party built-ins. A built-in like `queryHref` (whose runtime lives in `@barefootjs/client`) is registered by the compiler as a **default-applied plugin** (`packages/jsx/src/builtin-lowering-plugins.ts`, wired up on load in `index.ts`), NOT as a bespoke recognition branch in each adapter. So adapters have one uniform path with no per-API special-casing to keep in sync. A plugin that returns a raw output string, or an adapter renderer that emits an unmapped helper verbatim, defeats the point — return neutral IR and switch on the helper id.
- **Never reintroduce ad-hoc loop-scope tracking** (a mutated `Set`/`Map`/stack of "names a `.map()`/`.filter()` callback binds"). Six independent versions of this caused their own bugs before #2482 collapsed them onto one shared, immutable `BindingScope` (`packages/jsx/src/scope/binding-scope.ts`), threaded as a parameter/field wherever a live scope answer is needed — `enterLoopRow`/`enterCallback` return a NEW scope rather than mutating, so a caller holding an old reference can't observe a wrong scope. Two consumer classes, never conflate them: **shadow guards** (does an outer const/prop need to be shadowed here?) read `isBound()`/`boundNames()`; **reactivity/slot-ID classifiers** (does this expression need its own patchable per-row slot?) read `valueBoundNames()` — folding a preamble local into the latter double-counts it against its own dedicated slot machinery (a real regression class, not hypothetical). See `spec/compiler.md`'s "`BindingScope`: loop/callback binding resolution" section for the full API and the scope-window rule for adapters. Backstopped by `packages/jsx/src/__tests__/binding-scope-ratchet.test.ts`, a shrink-only ledger of direct uses of the legacy devices — now at its floor; every remaining entry is a justified permanent exception, not debt.

## Testing

See `spec/testing.md` for full testing specification with APIs, patterns, and examples.

| Layer | Verifies | Location | Speed |
|-------|----------|----------|-------|
| Compiler unit | Transformation rules, error codes, analysis | `packages/jsx/src/__tests__/` | ms |
| Component IR | Structure, a11y, signals, classes, event wiring | `ui/components/ui/*/index.test.tsx` | ms |
| Adapter conformance | IR → HTML output per adapter | `packages/adapter-tests/fixtures/` | ms |
| CSR conformance | Client JS → correct DOM output | `packages/adapter-tests/src/__tests__/csr-conformance.test.ts` | ms |
| Runtime unit | Signals, DOM ops, hydration primitives | `packages/client/__tests__/` | ms |
| E2E | User interactions, hydration, visual | `site/ui/e2e/` | seconds |

Quick decision guide:
- **New UI component** → Component IR test using `renderToTest()`
- **Compiler internals** (analysis, error codes, codegen) → Compiler unit test
- **Template HTML output** → Adapter conformance fixture
- **Client JS behavior** → CSR conformance fixture
- **Click/keyboard behavior** → E2E test
- **Which handler calls which setter** (event→setter wiring) → Component IR test via `renderToTest().find(...).onClick`. This verifies the compiler-built dependency *path*, not the runtime value — assert the path here, assert the displayed value in E2E.
- **Static attribute / class / ARIA changes** → Component IR test. Do NOT add an E2E test for static-only changes; that's an anti-pattern (see `spec/testing.md`).
- **Hydration correctness** is a compiler invariant. Fix in `packages/jsx/`, verify with E2E.

`renderToTest` resolution semantics: the framework models the component compiled with NO incoming props. `Record<T, string>[key]` indexed lookups DO resolve (structured `lookup` template part, PR #2000) with **union semantics** — for variant components (`const sizeClasses: Record<Size, string> = {...}` + `${sizeClasses[size]}`), `.classes` contains every case's tokens at once (the framework can't pick a concrete key at IR time); inline ternary classNames union both branches the same way. Literal destructure defaults (`{ size = 'md' }`) DO resolve as the prop's value in attributes, template interpolations, and text expressions (so `findByText` sees the zero-props render); non-literal defaults (arrows, computed) stay as expression text. Assert per-variant tokens with `toContain`; verify concrete single-variant output at the adapter conformance layer. Unresolvable dynamic interpolations (e.g. a `${className}` passthrough) are dropped from `.classes`. Regression pins: `packages/test/__tests__/render-to-test.test.ts` (`Record[key]` + default-prop describes) and `ui/components/ui/button/index.test.tsx`.

Tracked limitations across the compiler, adapters, and runtime live under the [`known-limitation`](https://github.com/piconic-ai/barefootjs/labels/known-limitation) label — that label URL is the source of truth. A second label tiers each entry, and the compatibility policy itself is the classifier: **`+ bug`** = silent divergence to fix (output silently differs from the contract — the policy violation class); **`+ enhancement`** = capability gap (today a loud, `/* @client */`-escapable refusal working as designed; the issue tracks adding faithful lowering); **bare `known-limitation`** = accepted permanent design position (pinned + documented, no fix planned). Apply the matching tier label when filing. Orthogonal to the tiers, **`+ blocked`** marks an entry whose resolution waits on an external dependency (an upstream bug, an ecosystem fix) — it records state, not intent, composes with any tier, and comes off when the dependency clears. Adapter-internal declarations (`skipJsx`, `skipFixtures`, `expectedDiagnostics`) carry a docstring pointer back to the per-issue URL.

**A reproducible defect lands as a fixture, not a prose report.** When exploration, review, or debugging turns up a divergence, deliver it as the three-piece set: (1) a `known-limitation` issue; (2) a conformance fixture asserting the CORRECT output — hand-author `expectedHtml` when the reference adapter itself is broken, and register the id in `generate-expected-html.ts`'s `SKIP_AUTO_UPDATE` so auto-update doesn't overwrite the intent; (3) pins on the broken side (`skipJsx` / `renderDivergences` / csr-conformance skips / the scope-gate's `KNOWN_UNDECLARED`), each carrying the issue URL. Graduation = fix the emission, regenerate `expectedHtml` from the fixed reference, delete the pins — at that moment the fixture flips into the fix's regression test. Prose is only for what can't execute: DX observations and "verified faithful" inventories go in the issue body, not committed documents. (Precedent: PR #2461 — six silent gaps landed as pinned fixtures; the #2460/#2468 fixes then graduated their pins with the fixtures already in place as regression armor.)

**A subset extension merges only with fixtures in the same PR** (`spec/subset-conformance.md`'s change-time coupling rule — TC39's stage-4 analogue). Widening what the compiler accepts — a new `ParsedExpr` kind or field, a catalogue entry (an `array-method` member, a sort-comparator form), or a builtin lowering plugin — means adding at least one conformance fixture (`packages/adapter-tests/fixtures/`) that exercises it in the **same** PR; the feature and its coverage land together, never in separate steps. All four named halves are mechanically backstopped: a new `PARSED_EXPR_KINDS` member or `array-method` union method fails its exhaustiveness pin (`expression-parser.ts`); a builtin lowering plugin and a sort-comparator form are floored the same way (`BUILTIN_LOWERING_PLUGINS` and the pinned `SORT_KEY_*` registries are the denominators; the coverage walk recomputes their numerators as `lowering:<plugin>` / `sort-*` axes). In every case the coverage-ledger floor test (`coverage-map.test.ts`) then demands a covering fixture or a documented allowlist exclusion. Only a *genuinely new extension category* — one no registry anticipates yet — has this written rule as its sole backstop, and the way to honor it is to land the category's registry + floor in the same PR as its first member, not to rely on review (the review-only era already leaked once: `queryHref` shipped with zero fixtures, and the first floored fixture immediately surfaced #2741).

Workflow for editing a UI component:
1. Run `bun run bf docs <component>` (and `bf debug graph <component>` if `"use client"`) for the API surface.
2. Add or update the IR test (red).
3. Edit the component.
4. Re-run the IR test (green).
5. Update `site/ui/e2e/<component>.spec.ts` **only if** user-facing interactive behavior (click / keyboard / hover / hydration) changed.

## CLI

The `bf` CLI (`bun run bf`) MUST be your first reference for component APIs, framework docs, and signal graphs — before reading source files. Run `bf --help` for the full command list.

Required usage:
- Before editing a stateful component (`"use client"`): run `bf debug graph <component>` to understand its reactive structure.
- Reading the source is only acceptable when CLI output is insufficient (e.g. class-composition patterns, internal helpers, `...props` spread behavior).

## Reference Adapter

`packages/adapter-hono/` is the **reference adapter**. Every fixture's `expectedHtml` is
generated from it, so its output *is* the contract the other eight adapters are measured
against.

When two adapter families disagree about the same question, **Hono's answer is correct by
construction** — not because it is better designed, but because it is the definition. Never
resolve such a disagreement by taking the majority answer, and never resolve it by taking
whichever side is easier to keep: unifying onto the DSL adapters' answer silently redefines
the contract for every fixture at once. (#2753 → #2762 → #2772 is the worked example: a
correct-in-intent collapse of sixteen duplicated row-key decisions took the DSL answer,
changed the reference, and put a regression on `main` that only the fixture-drift job saw.)

The one exception is where Hono is *itself* the broken side — then hand-author the fixture's
`expectedHtml` to the correct output and register the id in `generate-expected-html.ts`'s
`SKIP_AUTO_UPDATE` so auto-update does not overwrite the intent. Say so explicitly when you
do; silently regenerating from a broken reference writes the bug in as the expectation.

**One decision, two implementations, no test comparing them** is the defect family this
repo keeps producing. When you find a decision answered in more than one place, the
deliverable is a single shared implementation the sites call — not an Nth copy that happens
to agree today. A cross-adapter test pinning both families to the same answer for the same
input is what makes the drift visible at all.

## When `main` Breaks

A red `main` is an outage, not a task. **Reverting is the first option to consider**, not the
last: `git revert` the offending merge to get `main` green immediately, then fix forward on a
branch at normal pace. If you choose not to revert, say why in the same breath — "the fix is
one line and verified" is a reason; "I have already started writing the fix" is not.

Do not leave `main` red while a fix PR is written, reviewed and CI'd. That trades an hour of
everyone else's red build for your convenience.

Before merging anything to `main`, establish the fixture-drift answer for the PR's own head.
**On a stacked PR the job does not run at all**, so "it was not red" is not evidence:
`update-fixtures.yml` is gated `on: pull_request: branches: [main]`, and a PR based on
another branch never triggers it. Measured: `update-fixtures.yml` has zero runs for
`claude/barefootjs-datakey-ir` (#2762's branch); the bottom-of-stack PRs whose base *was*
`main` (#2752, #2761, #2772) all ran it and were green.

So:

- **Base is `main`** → check `update-expected-html` **by name** on the PR's own head. Green
  elsewhere plus a missing drift job is not a pass.
- **Base is another branch** (any stacked PR) → there is no job to check. Run
  `bun run packages/adapter-tests/scripts/generate-expected-html.ts` yourself in a real
  checkout and confirm `git status --short` is empty before that work reaches `main`.
  A worktree with symlinked `node_modules` resolves `@barefootjs/*` to the primary clone's
  compiler and measures the wrong tree — either give the worktree its own `bun install` or
  use the primary clone.

That gap is how #2762's regression reached `main`: it was a stacked PR, the drift gate
structurally could not see it, and nobody ran the generator by hand.

## Git Commit

Every commit MUST end with `Co-authored-by:` trailers for **all** participants other than the git author. Place them as the final lines of the message — no blank line or trailing content after them, otherwise GitHub will not recognize them.

List one line per participant, in this order:

1. **The implementer** — the AI that wrote the code (you). Use your model name from the system prompt.
   Example: `Co-authored-by: Claude Opus 4.7 <noreply@anthropic.com>`
2. **Other collaborators** — any other AI that directed, reviewed, or co-implemented the change in this session, and any human collaborator who is not the git author. One trailer per participant.

Never skip step 1, regardless of environment (local, Web, IDE). If you cannot identify your model name from the system prompt, ask the user before committing rather than omitting the trailer.

When `CLAUDE_CODE_ENTRYPOINT=remote` (Claude Code Web), the git author is `Claude` by default. Before the first commit of the session, run `git log --format='%an <%ae>' | grep -v '^Claude ' | sort -u` and let the user pick the human identity via `AskUserQuestion`. Remember the choice for the session and add that human as a co-author on every commit.
