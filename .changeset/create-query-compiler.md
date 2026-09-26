---
"@barefootjs/client": minor
"@barefootjs/jsx": minor
"@barefootjs/hono": patch
---

Export `createQuery` (with `QueryAction` and `CreateQueryOptions`) from `@barefootjs/client`, and compile it. `const [posts, fetchPosts] = createQuery(fn, { initial })` is recognised as a reactive factory: `posts()` is seeded from `initial` on the server on every adapter (`undefined` when `initial` is absent), and the request function is emitted into client JS only, with prop reads kept live. It is never evaluated on the server. Reading `fetchPosts.isPending()` or `fetchPosts.error()` in a template position is refused with the new BF117 on every adapter, including Hono, until the compiler seeds those accessors; defer the read with `/* @client */` or read it in an event handler or effect.

`http`, `HttpError` and `createQuery` now live in the new `@barefootjs/client/async` subpath, which both the main entry and `/runtime` re-export. A page therefore has one query cache and one `HttpError` class, whichever entry each module imports from. `http` and `HttpError` are also exported from `/runtime` now, which compiled client JS imports from. Importing `http`, `HttpError` or `createQuery` from `@barefootjs/client` no longer reports BF051. The Hono SSR shim re-exports `http` and `HttpError`.
