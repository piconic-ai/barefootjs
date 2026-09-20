---
"@barefootjs/client": minor
"@barefootjs/jsx": minor
"@barefootjs/hono": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

`@barefootjs/client`'s `formatDate` is now documentation-tier `@internal` and no longer appears in `docs/core/advanced/api-reference.md` or the API comparison table — it is compiler ABI (the lowering target of the `.toLocaleDateString(locale, { timeZone, ... })` sugar), not an authored API. This is a breaking behaviour change for anyone who imported it directly: **an authored `formatDate(...)` call in a template position now fails to compile with BF056**, on every adapter including Hono. Fix it by switching to `date.toLocaleDateString(locale, { timeZone, ... })` with literal options (compiles to the same `format_date` helper), or by deferring the whole read to the client with `/* @client */`.

`@barefootjs/jsx` no longer registers a lowering plugin for authored `formatDate(...)` calls (`formatDatePlugin` removed) and instead refuses them with the new BF056 diagnostic, fired once in the shared IR-build phase ahead of every adapter's `generate()`. The `.toLocaleDateString()` sugar's own lowering is unaffected.

Each of the nine template-language adapters (plus Hono) pins the new `format-date` conformance fixture's BF056 refusal in its own `conformance-pins.ts`.
