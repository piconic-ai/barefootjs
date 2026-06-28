---
"@barefootjs/go-template": patch
---

Lower standalone `.sort(cmp)` / `.reduce(fn, init)` on the Go adapter through the
runtime evaluator (#2018, P1). The comparator / reducer body is serialized to a
ParsedExpr JSON blob and evaluated per element by the new `bf_sort_eval` /
`bf_reduce_eval` template helpers, with captured free variables threaded as
`base_env` via `bf_env` — generalizing the fixed `bf_sort` / `bf_reduce`
catalogues to any pure comparator / reducer body. A comparator the evaluator
can't model (e.g. `localeCompare`) falls back to the legacy `bf_sort` path, so
behavior there is unchanged. The runtime struct-field reader now resolves a JS
field name (`id`) case-insensitively against the Go struct field (`ID`), which
the evaluator's raw field names require. Rendered HTML is unchanged; only the
emitted template text moves to the evaluator helpers. (The chained
`.sort().map()` / `.filter().map()` loop-hoist and the mojo/xslate adapters keep
the legacy path until their own phases.)
