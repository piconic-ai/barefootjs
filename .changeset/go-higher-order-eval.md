---
"@barefootjs/go-template": patch
---

Lower higher-order methods (`.filter` / `.find` / `.findIndex` / `.findLast` /
`.findLastIndex` / `.every` / `.some`) on the Go template adapter through the
runtime evaluator (#2018, P2). The predicate body — already a `ParsedExpr` on
the `higher-order` IR node — serializes to JSON and emits `bf_filter_eval` /
`bf_find_eval` / `bf_find_index_eval` / `bf_every_eval` / `bf_some_eval`, with
captured free vars threaded via `bf_env`, generalizing the field-equality /
truthiness predicate catalogue to any pure predicate body. A predicate the
evaluator can't model (a method-call / signal-getter predicate) falls back to
the structured `bf_filter` / `bf_find` / … helpers and the `{{range}}`
template-block path; `.filter(Boolean)` keeps its dedicated `bf_filter_truthy`
lowering. Rendered HTML is unchanged; only the emitted template text moves to
the evaluator helpers.
