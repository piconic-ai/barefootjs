---
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/perl": patch
---

Lower standalone `.sort(cmp)` / `.reduce(fn, init)` on the Mojolicious and
Xslate adapters through the runtime evaluator (#2018, P1 — the Perl half of the
Go change). The comparator / reducer body is serialized to a ParsedExpr JSON
blob and evaluated per element by the new `bf->sort_eval` / `bf->reduce_eval`
(`$bf.sort_eval` / `$bf.reduce_eval` in Xslate) helpers, with captured free
variables threaded as a `base_env` hashref — generalizing the fixed `bf->sort` /
`bf->reduce` catalogues to any pure comparator / reducer body. A comparator the
evaluator can't model (e.g. `localeCompare`) falls back to the legacy `bf->sort`
path, so behavior there is unchanged. The shared Perl runtime gains
`BarefootJS::Evaluator::fold_json` / `sort_by_json` (the JSON-string seam the
templates emit into) and the `sort_eval` / `reduce_eval` controller helpers.
Rendered HTML is unchanged; only the emitted template text moves to the
evaluator helpers. The chained `.sort().map()` / `.filter().map()` loop-hoist
keeps the legacy path until its own phase (P3).
