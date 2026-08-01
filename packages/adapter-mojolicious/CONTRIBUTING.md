# Contributing to BarefootJS

Thanks for your interest in BarefootJS! This project has a deliberately
unusual contribution model — please read this first.

> [!WARNING]
> **Alpha software.** APIs may change without notice. The contribution
> process below may also evolve as the project matures.

## Contribution policy: issues, not external PRs

**We do not accept unsolicited pull requests from outside the core team.**

This is a conscious decision, not unfriendliness. As a compiler that other
people's apps build on, BarefootJS treats its supply chain seriously, and we
want to keep the codebase free of unreviewed, machine-generated "AI slop."
Accepting arbitrary external PRs works against both goals.

Instead, **design discussions in issues are very welcome**, and they are how
real change happens here:

- Found a bug? **Open an issue.**
- Want a feature, an API change, or a new adapter? **Open an issue** and let's
  discuss the design first.
- Have a fix in mind? Describe it in the issue — code snippets, a diff, a
  reproduction, or a full patch in the issue body are all great.

**Contributions made through issues are credited as co-authors on the
resulting commits.** When a maintainer lands the change, your name goes in the
`Co-authored-by:` trailers. You get credit; the project keeps a reviewed,
trusted history.

If you are a core maintainer (or have been explicitly invited to send a PR for
a specific issue), the rest of this guide is for you.

## Where to start

- **Bug reports** → use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml).
- **Feature / design proposals** → use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.yml).
- **Known limitations** are tracked under the
  [`known-limitation`](https://github.com/piconic-ai/barefootjs/labels/known-limitation)
  label. Each issue documents the shape, affected fixtures, available
  workaround, and fix direction — a good place to understand current edges.

## Project overview

BarefootJS compiles signal-based TSX into a marked template plus client JS for
any backend, using a 2-phase pipeline: **JSX → IR → Marked Template + Client JS**.

- `packages/jsx/` — Core compiler (`jsx-to-ir.ts`, `ir-to-client-js.ts`, `analyzer.ts`).
- `packages/client/` — Client runtime (`createSignal`, `createEffect`, DOM runtime).
- `packages/cli/` — The `bf` CLI.
- Adapters — `packages/adapter-hono/`, `packages/adapter-go-template/`,
  `packages/adapter-mojolicious/`, and others.

See [`spec/compiler.md`](spec/compiler.md) for the full pipeline, IR schema,
transformation rules, adapter interface, and error codes.

## Development setup

Requires **Node 22+** and [Bun](https://bun.sh) (this repo uses `bun`, not `npm`,
for package management).

```sh
git clone https://github.com/piconic-ai/barefootjs.git
cd barefootjs
bun install
bun run build
```

Useful scripts:

| Command | What it does |
|---------|--------------|
| `bun run build` | Build all packages (ordered) |
| `bun test` | Run the root test suite |
| `bun run lint` | Lint / format check with Biome |
| `bun run bf --help` | The `bf` CLI — component APIs, docs, signal graphs |
| `bun run dev:all` | Run the site + example apps locally |

The `bf` CLI is the fastest way to understand a component before touching it —
`bf docs <component>` for the API surface, `bf debug graph <component>` for the
reactive structure of a `"use client"` component.

## Testing

BarefootJS has layered tests; pick the layer that matches your change. Full
details live in [`spec/testing.md`](spec/testing.md).

| Layer | Verifies | Location |
|-------|----------|----------|
| Compiler unit | Transformation rules, error codes, analysis | `packages/jsx/src/__tests__/` |
| Component IR | Structure, a11y, signals, classes, event wiring | `ui/components/ui/*/index.test.tsx` |
| Adapter conformance | IR → HTML output per adapter | `packages/adapter-tests/fixtures/` |
| CSR conformance | Client JS → correct DOM output | `packages/adapter-tests/src/__tests__/csr-conformance.test.ts` |
| Runtime unit | Signals, DOM ops, hydration primitives | `packages/client/__tests__/` |
| E2E | User interactions, hydration, visual | `site/ui/e2e/` |

Quick guide:

- **New UI component** → Component IR test using `renderToTest()`.
- **Compiler internals** (analysis, error codes, codegen) → Compiler unit test.
- **Template HTML output** → Adapter conformance fixture.
- **Client JS behavior** → CSR conformance fixture.
- **Click / keyboard behavior** → E2E test.

Run the relevant suite before submitting, and `bun run lint` to keep formatting
consistent.

## Coding conventions

A few rules the codebase enforces (see [`CLAUDE.md`](CLAUDE.md) for the full set):

- **Never parse imports or any JS/TS syntax with regex or string matching.**
  Use the established AST-based patterns — the IR's parsed metadata for source
  files, a TS AST walk for compiled client JS. `typescript` is already a
  direct dependency; do not add a second parser.
- **Do not add compiler options/hooks for tool-specific output rewriting.**
  Tools that need to adjust emitted client JS post-process it themselves.
- The codebase is TypeScript. Adapters target a range of backends (Hono,
  Go `html/template`, Mojolicious, and more), so keep core compiler and
  runtime code adapter-agnostic. CSS uses UnoCSS.

## Changesets

This repo uses [Changesets](https://github.com/changesets/changesets) for
versioning. If your change affects a published package, add a changeset:

```sh
bun changeset
```

Describe the change and pick the appropriate semver bump. Internal-only
packages are ignored (see `.changeset/config.json`).

## Commit conventions

Every commit ends with `Co-authored-by:` trailers for **all** participants
other than the git author — including issue contributors whose design or patch
landed in the commit. Place them as the final lines of the message, with no
blank line or trailing content after them, or GitHub will not recognize them:

```
Fix signal dependency tracking in nested effects

Co-authored-by: Some Contributor <contributor@example.com>
```

## Code of Conduct & Security

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). To
report a security vulnerability, follow the [Security Policy](SECURITY.md) —
**please do not open a public issue for security reports.**

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE) that covers the project.
