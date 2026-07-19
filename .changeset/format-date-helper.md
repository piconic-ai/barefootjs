---
'@barefootjs/client': minor
'@barefootjs/jsx': minor
'@barefootjs/hono': patch
'@barefootjs/go-template': patch
'@barefootjs/erb': patch
'@barefootjs/perl': patch
'@barefootjs/php': patch
'@barefootjs/jinja': patch
'@barefootjs/rust': patch
---

Add `formatDate(date, pattern, timeZone)` (#2324): a pure-function date formatter with explicit inputs — pattern tokens `YYYY`/`MM`/`M`/`DD`/`D`, timezone `'UTC'` or a fixed `±HH:MM` offset — exported from `@barefootjs/client` and catalogued as the backend-neutral `format_date` template helper. SSR adapters lower the call through the builtin lowering-plugin registry and render it natively on every backend (Go, Ruby, Perl, PHP, Python, Rust) with byte-identical, golden-vector-pinned output; no locale, timezone database, or ICU data is consulted anywhere.
