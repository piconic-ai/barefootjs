---
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/go-template": patch
---

SSR-compute memos derived from the `createSearchParams()` env signal (#2075), building on the #1922 per-request readers. Mojo/Xslate: an `envReader` signal marks the canonical `searchParams` reader available to the in-template memo seed (aliased getters canonicalise), and the seed-availability check now allows lowering-internal bindings (arrow/lambda params, Perl's `$_` grep topic, Kolon's `$bf`), so scalar derived memos AND list-filter memos (`items.filter(p => …tag()…)`) seed in-template. Go: the generated constructor lowers `searchParams().get('k')` (bare and `?? '<lit>'` defaulted) to `in.SearchParams`, with the same documented `?? → or` empty-string divergence as the template-position lowering; list-valued derived memos remain the #2075 residual.
