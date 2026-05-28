---
"@barefootjs/cli": minor
---

Move the preview tool into `@barefootjs/cli` and rewrite it as a compiler-based CSR build. `bf preview <component>` compiles the component (and its deps) to client JS and bundles a browser preview that renders via `@barefootjs/client`'s `render()` — full reactivity for stateful components, no SSR server. The standalone `@barefootjs/preview` package is removed; preview now ships with the CLI (no Hono, no separate install).

Preview only compiles the previewed component's transitive dependency closure instead of the whole component registry, cutting a single-component build from ~26s to ~7s. New flags: `--serve` starts a built-in static server (no more separate `npx serve` step), and `--watch` rebuilds on source changes with live reload (`--port` to choose the port).

`bf preview` now runs under Node (no Bun required) and works in end-user projects, not just the monorepo. Design tokens, `globals.css` and the UnoCSS config are resolved per-environment — your project's own files when present, otherwise defaults bundled with the CLI — so `bf add`-ed components preview with zero setup while respecting a project's own theme. Requires `unocss` and `@barefootjs/client` to be installed in the project (a clear message is shown if either is missing).
