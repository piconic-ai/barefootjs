---
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/perl": patch
---

Lower `.flatMap(proj)` through the runtime evaluator (#2018, P3). The projection
body serializes to a ParsedExpr JSON blob and `bf_flat_map_eval` /
`bf->flat_map_eval` / `$bf.flat_map_eval` projects each element then flattens
one level, generalizing the structured self / field / tuple
(`bf_flat_map` / `bf_flat_map_tuple`) catalogue to any pure projection. A
projection the evaluator can't model falls back to the structured helper. The
shared runtime gains `BarefootJS::Evaluator::flat_map` / `flat_map_json` and a
`flat_map_eval` controller helper (Go `FlatMapEval`, registered as
`bf_flat_map_eval`). Rendered HTML is unchanged; only the emitted template text
moves to the evaluator helper. (`.flat(depth?)` is a non-callback array method
and stays folded.)
