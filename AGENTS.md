# BarefootJS

JSX → Marked Template + client JS compiler. Signal-based reactivity for any backend.

## Project Setup / Tech Stack

This project primarily uses TypeScript with Go template adapters. Use `bun` instead of `npm` for package management. For CSS, use UnoCSS — note that UnoCSS alpha modifiers do not work with CSS variables, and files must be explicitly included in UnoCSS scanning config.

## Architecture

2-phase compilation: JSX → IR → Marked Template + Client JS
Adapters: HonoAdapter (`packages/adapter-hono/`), GoTemplateAdapter (`packages/adapter-go-template/`)

## Code Map

- `packages/jsx/src/` — Core compiler
  - `jsx-to-ir.ts` — Phase 1: JSX to IR
  - `ir-to-client-js.ts` — Phase 2: IR to client JS
  - `analyzer.ts` — Reactivity analysis
- `packages/dom/src/` — Client runtime (createSignal, createEffect, etc.)
- `packages/adapter-hono/` — Hono/JSX adapter
- `packages/adapter-go-template/` — Go html/template adapter
- `ui/` — UI component registry
- `site/core/` — Main site: landing page + documentation (Hono + Cloudflare Workers)
  - `site/core/landing/` — Landing page components and routes
- `site/ui/` — UI component documentation site (Hono + Cloudflare Workers)
- `site/shared/` — Shared design tokens and components across sites
- `docs/core/` — Documentation content (Markdown source files)

## Testing

See `spec/testing.md` for full testing specification with APIs, patterns, and examples.

| Layer | Verifies | Location | Speed |
|-------|----------|----------|-------|
| Compiler unit | Transformation rules, error codes, analysis | `packages/jsx/src/__tests__/` | ms |
| Component IR | Structure, a11y, signals, classes | `ui/components/ui/*/index.test.tsx` | ms |
| Adapter conformance | IR → HTML output per adapter | `packages/adapter-tests/fixtures/` | ms |
| CSR conformance | Client JS → correct DOM output | `packages/adapter-tests/src/__tests__/csr-conformance.test.ts` | ms |
| Runtime unit | Signals, DOM ops, hydration primitives | `packages/dom/__tests__/` | ms |
| E2E | User interactions, hydration, visual | `site/ui/e2e/` | seconds |

Quick decision guide:
- **New UI component** → Component IR test using `renderToTest()`
- **Compiler internals** (analysis, error codes, codegen) → Compiler unit test
- **Template HTML output** → Adapter conformance fixture
- **Client JS behavior** → CSR conformance fixture
- **Click/keyboard behavior** → E2E test
- **Static attribute / class / ARIA changes** → Component IR test. Do NOT add an E2E test for static-only changes; that's an anti-pattern (see `spec/testing.md`).
- **Hydration correctness** is a compiler invariant. Fix in `packages/jsx/`, verify with E2E.

`renderToTest` resolution limits (known): the IR analyzer does NOT resolve `Record<T, string>[key]` indexed lookups or default-prop values. For variant components (`const sizeClasses: Record<Size, string> = {...}` + `${sizeClasses[size]}`), the `.classes` array in IR only contains the base class tokens, not the per-variant ones. Verify variant resolution at the adapter conformance layer instead, or add a fixture in `packages/adapter-tests/fixtures/`. See `ui/components/ui/button/index.test.tsx` for the existing workaround pattern.

Workflow for editing a UI component:
1. Run `bun run barefoot ui <component>` (and `barefoot inspect <component>` if `"use client"`) for the API surface.
2. Add or update the IR test (red).
3. Edit the component.
4. Re-run the IR test (green).
5. Update `site/ui/e2e/<component>.spec.ts` **only if** user-facing interactive behavior (click / keyboard / hover / hydration) changed.

## CLI

Use the `barefoot` CLI (`bun run barefoot`) first to look up component APIs, framework docs, and inspect signal graphs. When the CLI output is insufficient for the task (e.g. you need to know the class-composition pattern, internal helper constants, or `...props` spread behavior before editing), reading the source file is acceptable — but the CLI must be your first reference, not the source.

- `barefoot search <query>` — Find components and docs by name/category/tags
- `barefoot ui <component>` — Component reference (props, examples, a11y)
- `barefoot core <topic>` — Core docs (signals, compiler constraints, error codes, etc.)
- `barefoot inspect <component>` — Show signal dependency graph (signals, memos, DOM bindings). Bindings wrapped by the Solid-style fallback (#937) are prefixed with `~`.
- `barefoot why-update <component> <signal>` — Trace update propagation path from a signal to DOM
- `barefoot why-wrap <component>` — List fallback-wrapped expressions (#937). Each is a candidate for `createMemo` refactor — the runtime effect subscribes to whatever it reads at runtime, possibly nothing.
- `barefoot test --debug <component>` — Show signal initialization trace and effect bindings

Before editing a stateful component (`"use client"`), run `barefoot inspect` first to understand its reactive structure. All inspection commands support `--json` for machine-readable output.

## Implementation Guidelines

When implementing a feature, match the capability level of existing similar features. For example, if filter() supports arbitrary predicates, find() should too. Always check sibling implementations for parity.

## Specs

- `spec/compiler.md` — Compiler spec: pipeline architecture, IR schema, transformation rules, adapter interface, error codes
- `spec/testing.md` — Testing spec: layer responsibilities, decision guide, APIs, patterns, anti-patterns

## Git Commit (Codex Web)

When `CLAUDE_CODE_ENTRYPOINT=remote`, append `Co-authored-by` as the **last line** of every commit message (GitHub requires it to be last to recognize it).

Before the first commit, run `git log --format='%an <%ae>' | grep -v '^Codex ' | sort -u` and let the user pick via `AskUserQuestion`. Remember the choice for the session.
