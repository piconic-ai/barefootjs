---
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/perl": patch
---

Lower higher-order methods (`.filter` / `.find` / `.findIndex` / `.findLast` /
`.findLastIndex` / `.every` / `.some`) on the Mojolicious and Xslate adapters
through the runtime evaluator (#2018, P2 — the Perl half of the Go change). The
predicate body serializes to a ParsedExpr JSON blob and emits
`bf->filter_eval` / `bf->find_eval` / `bf->find_index_eval` / `bf->every_eval` /
`bf->some_eval` (`$bf.…` in Xslate), with captured free vars threaded as a
`base_env` hashref — the same JS-faithful evaluator the Go adapter uses, so the
two SSR backends stay byte-isomorphic. A predicate the evaluator can't model
(e.g. a method-call predicate) falls back to the inline `grep` / Kolon-lambda /
`bf->find` lowering, and `.filter(Boolean)` keeps its inline truthiness form.

The shared `BarefootJS` runtime gains `filter_eval` / `every_eval` / `some_eval`
/ `find_eval` / `find_index_eval` controller helpers, delegating to the
`BarefootJS::Evaluator` predicate helpers. Rendered HTML is unchanged; only the
emitted template text moves to the evaluator helpers.
