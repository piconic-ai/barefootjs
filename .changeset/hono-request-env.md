---
"@barefootjs/client": minor
"@barefootjs/hono": minor
---

Request-scoped environment signals (`searchParams()`, and future cookies/…) now resolve at SSR for the non-Hono JS hosts that render via `renderToHtml` (h3 / Elysia / any WinterCG handler), through one **keyed** request-env mechanism. #1922 (follow-up to router v0.5).

Hono resolves a request's environment through `useRequestContext()` inside its `jsxRenderer` async context; `renderToHtml` has none, so `searchParams()` previously resolved to the empty default regardless of the request — query-dependent initial content flashed / mismatched on hydration.

- **`@barefootjs/client`**: the searchParams-specific server reader seam is generalised to a single keyed one. `__bfSetServerSearchReader` → `__bfSetServerEnvReader((key) => …)` and `globalThis.__bf_serverSearchReader` → `globalThis.__bf_serverEnvReader(key)` (`createEnvSignal` now takes the env `key`). One seam serves every env signal, so a new signal (cookies, …) needs no new seam, setter, or host function.
- **`@barefootjs/hono`**: new `@barefootjs/hono/request-env` subpath. It scopes the request env with a Node `AsyncLocalStorage`, so each render reads its own request's values and concurrent renders never race (a process-wide per-request global would, which the spec forbids). It installs on the shared keyed `__bf_serverEnvReader` seam (no `@barefootjs/client` import) and delegates to any prior reader when no scope is active, so a process mixing Hono and `renderToHtml` hosts keeps resolving both ways. behind its own subpath, so the always-on `renderToHtml` path never loads `node:async_hooks`. Two entry points:
  - `withRequestEnv(handler)` — wrap a WinterCG `fetch` handler once at the entry point. It derives the env from the `Request`, so the whole request runs with it bound and every `renderToHtml` inside resolves it with **no per-render plumbing**; the host never names env keys.
  - `runWithRequestEnv(env, fn)` + the keyed `BfRequestEnv` type — the lower-level primitive for hosts that bind env manually.

Usage (the bundled h3 and Elysia demos are wired this way — bind once, pages are plain `renderToHtml`):

```ts
import { withRequestEnv } from '@barefootjs/hono/request-env'

export default { port, fetch: withRequestEnv(myFetchHandler) }
```

Adding the cookie env signal later is then: define it in `@barefootjs/client`, add a `cookie` field to `BfRequestEnv` (and to the `Request`→env derivation behind `withRequestEnv`) — every host wired with `withRequestEnv` picks it up with **no code change**.
