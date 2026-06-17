---
"@barefootjs/go-template": minor
---

`searchParams()` (router v0.5) now renders at SSR on the Go template adapter, so the cross-adapter `search-params` conformance fixture (`{searchParams().get('sort') ?? 'none'}`) runs on Go instead of being skipped (#1922, follow-up to #1917).

- **Lowering**: Go's `and`/`or` are prefix builtins, so a multi-token operand (a method/function call, arithmetic, comparison, nested helper) must be parenthesised or it degrades into extra sibling args. `logical()` now composes both operands through `wrapIfMultiToken` — the file-wide idiom — so `searchParams().get(k) ?? d` lowers to `{{or (.SearchParams.Get "sort") "none"}}` instead of the broken `{{or .SearchParams.Get "sort" "none"}}` (which dropped the call grouping and rendered empty). This fixes the general `obj.method(arg) ?? fallback` shape, not just `searchParams`.
- **Runtime**: new `bf.SearchParams` type with a `.Get(key)` helper (empty-tolerant zero value over `url.Values`) and a `bf.NewSearchParams(raw)` constructor for route handlers (`bf.NewSearchParams(r.URL.RawQuery)`).
- **Codegen**: a `SearchParams bf.SearchParams` binding threaded through the generated `Input` / `Props` structs and `NewXxxProps`, emitted only when a component imports `searchParams` (and guarded against a name collision with a user prop/signal/memo of the same name). It is not serialised for hydration (`json:"-"`) — the client re-reads `window.location.search` itself. The zero value is an empty query, so a render with no request query resolves every key to `""` and the author's `?? default` renders.

The Mojolicious / Xslate template adapters stay skipped pending their own env-signal lowering + per-request Perl `search_params` reader (#1922).
