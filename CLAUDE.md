# BarefootJS

JSX → Marked Template + client JS compiler. Signal-based reactivity for any backend.

## Project Setup / Tech Stack

This project primarily uses TypeScript with Go template adapters. Use `bun` instead of `npm` for package management. For CSS, use UnoCSS — note that UnoCSS alpha modifiers do not work with CSS variables, and files must be explicitly included in UnoCSS scanning config.

## Architecture

2-phase compilation: JSX → IR → Marked Template + Client JS.

- `packages/jsx/src/` — Core compiler. Key files: `jsx-to-ir.ts` (Phase 1), `ir-to-client-js.ts` (Phase 2), `analyzer.ts` (reactivity analysis).
- `packages/client/src/` — Client runtime (`createSignal`, `createEffect`, etc.) with DOM runtime under `./runtime`.
- Adapters: `packages/adapter-hono/` (Hono/JSX), `packages/adapter-go-template/` (Go `html/template`).

See `spec/compiler.md` for the full pipeline architecture, IR schema, transformation rules, adapter interface, and error codes.

## Code Conventions

- **Never parse imports (or any JS/TS syntax) with regex or string matching.** Regexes false-match inside string/template literals and comments, and miss multi-line clauses, trailing commas, and `import type`. Use the established structural patterns instead:
  - **Source files (.tsx/.ts)**: the IR's parsed metadata (`ir.metadata.imports`, built by the analyzer's TS AST walk — see `collectImport` in `packages/jsx/src/analyzer.ts`).
  - **Compiled client JS**: a TS AST walk over top-level statements (`ts.isImportDeclaration` + span-based splicing). Precedents: `packages/cli/src/lib/resolve-imports.ts` (migrated from regex to AST for exactly this reason — see `shapeFromDecl`) and `packages/jsx/src/combine-client-js.ts`.
  - Do not add a second parsing library (e.g. es-module-lexer) — `typescript` is already a direct dependency and the AST walk is the repo-wide idiom.
- **Never add compiler options/hooks for tool-specific output *rewriting*** (e.g. a `rewrite(outputString)` callback on `CompileOptions`). A callback that munges the emitted output string makes the output depend on "which plugin ran" instead of on the compiler — debugging becomes archaeology, and the hook accretes callers as a sanctioned dumping ground. Tools that need to adjust emitted client JS post-process it themselves with the TS AST walk above; an extra `ts.createSourceFile` parse is acceptable off the build hot path (e.g. `bf debug profile`), not in `bf build`.
  - **Structural lowering registration is NOT this** and is allowed: the `LoweringPlugin` registry (`registerLoweringPlugin` in `packages/jsx/src/lowering-registry.ts`, #2057) lets a first-party package recognize a call and return a **backend-neutral `LoweringNode`** — a structured IR node, never a rewritten output string. Each adapter renders the node in its own syntax, so SSR/CSR parity is enforced once (in the neutral layer), not per plugin. Plugins are declared in `barefoot.config.ts` via `createConfig({ plugins: [...] })` (the `BuildOptions.plugins` field) and each adapter's `createConfig` registers them in its own `@barefootjs/jsx` instance. This is the sanctioned seam for keeping runtime-API names (`queryHref` → `@barefootjs/router/plugins`' `queryHrefPlugin`) out of the compiler core, and the same typed seam `bf debug`-style tooling should hook rather than string-rewriting. A plugin that returns a raw output string, or an adapter renderer that emits an unmapped helper verbatim, defeats the point — return neutral IR and switch on the helper id.

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

`renderToTest` resolution limits (known): the IR analyzer does NOT resolve `Record<T, string>[key]` indexed lookups or default-prop values. For variant components (`const sizeClasses: Record<Size, string> = {...}` + `${sizeClasses[size]}`), the `.classes` array in IR only contains the base class tokens, not the per-variant ones. Verify variant resolution at the adapter conformance layer instead, or add a fixture in `packages/adapter-tests/fixtures/`. See `ui/components/ui/button/index.test.tsx` for the existing workaround pattern.

Tracked limitations across the compiler, adapters, and runtime live under the [`known-limitation`](https://github.com/piconic-ai/barefootjs/labels/known-limitation) label — that label URL is the source of truth. Adapter-internal declarations (`skipJsx`, `skipFixtures`, `expectedDiagnostics`) carry a docstring pointer back to the per-issue URL.

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

## Git Commit

Every commit MUST end with `Co-authored-by:` trailers for **all** participants other than the git author. Place them as the final lines of the message — no blank line or trailing content after them, otherwise GitHub will not recognize them.

List one line per participant, in this order:

1. **The implementer** — the AI that wrote the code (you). Use your model name from the system prompt.
   Example: `Co-authored-by: Claude Opus 4.7 <noreply@anthropic.com>`
2. **Other collaborators** — any other AI that directed, reviewed, or co-implemented the change in this session, and any human collaborator who is not the git author. One trailer per participant.

Never skip step 1, regardless of environment (local, Web, IDE). If you cannot identify your model name from the system prompt, ask the user before committing rather than omitting the trailer.

When `CLAUDE_CODE_ENTRYPOINT=remote` (Claude Code Web), the git author is `Claude` by default. Before the first commit of the session, run `git log --format='%an <%ae>' | grep -v '^Claude ' | sort -u` and let the user pick the human identity via `AskUserQuestion`. Remember the choice for the session and add that human as a co-author on every commit.
