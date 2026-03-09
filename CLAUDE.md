# BarefootJS

JSX → Marked Template + client JS compiler. Signal-based reactivity for any backend.

## Project Setup / Tech Stack

This project primarily uses TypeScript with Go template adapters. Use `bun` instead of `npm` for package management. For CSS, use UnoCSS — note that UnoCSS alpha modifiers do not work with CSS variables, and files must be explicitly included in UnoCSS scanning config.

## Architecture

2-phase compilation: JSX → IR → Marked Template + Client JS
Adapters: HonoAdapter (`packages/hono/`), GoTemplateAdapter (`packages/go-template/`)

## Code Map

- `packages/jsx/src/` — Core compiler
  - `jsx-to-ir.ts` — Phase 1: JSX to IR
  - `ir-to-client-js.ts` — Phase 2: IR to client JS
  - `analyzer.ts` — Reactivity analysis
- `packages/dom/src/` — Client runtime (createSignal, createEffect, etc.)
- `packages/hono/` — Hono/JSX adapter
- `packages/go-template/` — Go html/template adapter
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
- **Hydration correctness** is a compiler invariant. Fix in `packages/jsx/`, verify with E2E.

## CLI

Use the `barefoot` CLI to look up component APIs and framework docs. Do not read source files to learn APIs.

- `barefoot search <query>` — Find components and docs by name/category/tags
- `barefoot ui <component>` — Component reference (props, examples, a11y)
- `barefoot core <topic>` — Core docs (signals, compiler constraints, error codes, etc.)

## Implementation Guidelines

When implementing a feature, match the capability level of existing similar features. For example, if filter() supports arbitrary predicates, find() should too. Always check sibling implementations for parity.

## Specs

- `spec/compiler.md` — Compiler spec: pipeline architecture, IR schema, transformation rules, adapter interface, error codes
- `spec/testing.md` — Testing spec: layer responsibilities, decision guide, APIs, patterns, anti-patterns

## Git Commit (Claude Code Web)

When `CLAUDE_CODE_ENTRYPOINT=remote`, append `Co-authored-by` as the **last line** of every commit message (GitHub requires it to be last to recognize it).

Before the first commit, run `git log --format='%an <%ae>' | grep -v '^Claude ' | sort -u` and let the user pick via `AskUserQuestion`. Remember the choice for the session.
