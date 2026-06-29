---
"@barefootjs/mojolicious": minor
"@barefootjs/xslate": minor
"@barefootjs/perl": minor
"@barefootjs/jsx": patch
---

`queryHref` SSR parity for the Mojolicious and Xslate adapters (#2042).

`queryHref(base, { … })` now lowers to a `query` runtime helper on the Perl adapters, matching the go-template `bf_query` lowering shipped in #2044:

- **Mojolicious** lowers it to `bf->query(base, …)`, **Xslate** to `$bf.query(base, …)`. Each object property becomes a `(guard, key, value)` triple; the helper includes a pair iff its guard is truthy AND its value is a non-empty string — so a plain `key: v` passes guard `1`, and a conditional `key: cond ? v : undefined` passes the lowered condition (mirroring the client's `if (value)`).
- A new `query` helper in the shared Perl runtime (`BarefootJS.pm`) builds the URL with `URLSearchParams.set` overwrite semantics and `application/x-www-form-urlencoded` encoding (space → `+`, UTF-8 byte-wise), so the rendered query string equals the browser / Hono render byte-for-byte.
- `@barefootjs/jsx` gains a backend-neutral `matchQueryHrefCall` / `queryHrefArgs` helper shared by the SSR adapters' lowering.

Recognition handles aliased imports and both the `@barefootjs/client` and `@barefootjs/client/runtime` entry points. A non-literal params object falls back to the generic lowering.
