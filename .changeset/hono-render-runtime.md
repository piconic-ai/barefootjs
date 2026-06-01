---
"@barefootjs/hono": minor
---

Add `@barefootjs/hono/render` with `renderToHtml` and `renderToStream` — a framework-agnostic SSR entry that renders a `hono/jsx` node to an HTML string / `ReadableStream` without a Hono app, router, or `jsxRenderer` request context. This lets any HTTP framework (h3, Elysia, …) host BarefootJS by importing `@barefootjs/hono` as a render runtime, mirroring how the Go `Echo` integration imports the go-template adapter's framework-agnostic `bf` runtime. Additive only; existing exports are unchanged.
