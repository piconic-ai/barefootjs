---
"@barefootjs/hono": patch
---

Re-export `queryHref` (and its `QueryParams` / `QueryParamValue` types) from the Hono adapter's client shim (#2042).

The shim resolves `@barefootjs/client` for the Hono SSR runtime; `queryHref` is a pure helper (no reactivity) that runs unchanged on the server, so it must be re-exported like `searchParams` / `splitProps`. Without it, rendering a component that imports `queryHref` failed at server start with `Export named 'queryHref' not found`. Completes the Hono side of the `queryHref` support added in #2044.
