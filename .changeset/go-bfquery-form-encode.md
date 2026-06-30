---
"@barefootjs/go-template": patch
---

Encode `bf_query` keys/values with `application/x-www-form-urlencoded` (matching the browser's `URLSearchParams` and the Perl `query` helper) instead of Go's `url.QueryEscape`, so a `queryHref(base, { … })` renders byte-for-byte identically across the go-template, Mojolicious, and Xslate SSR adapters and the Hono client (#2048, follow-up to #2042).

The two encoders agreed on everything except `~` and `*`: `url.QueryEscape` keeps `~` and percent-encodes `*`, whereas `URLSearchParams` percent-encodes `~` → `%7E` and keeps `*`. The new `formEscape` keeps the unreserved set `A-Z a-z 0-9 * - . _`, turns a space into `+`, and percent-encodes every other byte as `%XX` (uppercase, byte-wise UTF-8) — so query values containing `~` or `*` now match the other backends exactly.

The `query` helper is now covered by the shared golden helper vectors (`packages/adapter-tests/helper-vectors`), so the Go and Perl backends are conformance-tested against one set of `URLSearchParams`-derived expectations instead of hand-duplicated per-backend cases.
