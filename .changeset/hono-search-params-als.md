---
"@barefootjs/hono": minor
---

`searchParams()` now resolves the live request query at SSR for the non-Hono JS hosts that render via `renderToHtml` (h3 / Elysia / any WinterCG handler), via a new `@barefootjs/hono/search-params` subpath. #1922 (follow-up to router v0.5).

Hono resolves the per-request query through `useRequestContext()` inside its `jsxRenderer` async context; `renderToHtml` has none, so `searchParams()` previously resolved to the empty query regardless of the request — query-dependent initial content flashed / mismatched on hydration. The new `runWithSearchParams(search, () => renderToHtml(node))` scopes the query with a Node `AsyncLocalStorage`, so each render reads its own request's query and concurrent renders never race (a process-wide per-request global would, which the spec forbids).

The reader installs on the shared `globalThis.__bf_serverSearchReader` seam (no `@barefootjs/client` import, so no second client instance) and, when no render scope is active, delegates to whatever reader was already there — so a process mixing Hono and `renderToHtml` hosts keeps resolving both ways. The module is Node-only (`node:async_hooks`) and lives behind its own subpath, so the edge/Workers path through `renderToHtml` never loads `async_hooks`.

Usage:

```ts
import { renderToHtml } from '@barefootjs/hono/render'
import { runWithSearchParams } from '@barefootjs/hono/search-params'

// h3:     getRequestURL(event).search
// Elysia: new URL(request.url).search
const html = await runWithSearchParams(search, () => renderToHtml(<Layout …>…</Layout>))
```

The bundled h3 and Elysia integration demos are wired this way.
