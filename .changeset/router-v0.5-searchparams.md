---
"@barefootjs/client": minor
"@barefootjs/hono": minor
---

`searchParams()` — a request-scoped reactive **environment signal** (spec/router.md **v0.5**, "The wedge"). A same-route, query-only navigation (`/list?sort=price`) driven by `@barefootjs/router` now updates `searchParams()` and the URL **with no swap and no re-hydration** — islands reconcile fine-grained.

- **`@barefootjs/client`**: new top-level `searchParams: Reactive<() => URLSearchParams>`. It rides the shared `@barefootjs/client/reactive` runtime (structurally one instance), so the existing reactivity analysis wires DOM updates with no new compiler feature. The underlying signal is created lazily on first read (and the router push seam `window.__bf_pushSearch` is installed there, on first read — not at import), so the module has **no import-time side effects** and an island that never reads it can be tree-shaken out of it. The generic `createEnvSignal` stays internal; only `searchParams` is exported. (The spec's package-level `"sideEffects": false` hint is deferred: it currently triggers a bun bundler bug that collapses the runtime entry to a broken re-export facade — a separate follow-up.)
- **Request-scoped SSR**: on the server `searchParams()` resolves per-request through an injected reader (`__bfSetServerSearchReader`, or a `globalThis.__bf_serverSearchReader` seam) — never a process-wide module global, which would race across concurrent requests.
- **`@barefootjs/hono`**: auto-wires that reader via `useRequestContext().req` (async-context scoped, race-free) when the SSR scripts are rendered — no opt-in step. `searchParams` is also re-exported from the Hono `client-shim` (SSR) and from `@barefootjs/client/runtime` (the island bundle's import source), and is allow-listed in the compiler so importing it no longer trips `BF051`.

Covered by a cross-adapter conformance fixture (`search-params`): it runs on Hono today; the Go / Mojolicious / Xslate template adapters are skipped pending env-signal SSR lowering + runtime, tracked in [#1922](https://github.com/piconic-ai/barefootjs/issues/1922).

The router's query-only short-circuit (shipped in v0) activates automatically once an island reads `searchParams()`; until then query-only navigations fall back to a full swap.
