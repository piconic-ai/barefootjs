---
"@barefootjs/go-template": minor
---

Add the lightweight ParsedExpr evaluator to the Go runtime (#2018, Track B).

`bf.go`'s runtime gains a pure-expression evaluator (`EvalExpr` /
`EvalNode`) for higher-order callback bodies, plus the evaluator-driven
folds `FoldEval` (reduce / reduceRight over any reducer body) and
`SortEval` (sort by any comparator body). These are the runtime
generalization of the special-cased `bf_reduce` / `bf_sort` callback
catalogue: a callback body rides as a pure `ParsedExpr` and is evaluated
against an environment (`{acc, item, …captured free vars}`), so the
`+`/`*` op restriction, the `acc`-canonical form, and the comparator
pattern restriction all disappear.

The evaluator's coercion is JS-faithful (ToNumber / ToString / ToBoolean,
strict equality, `Math.round` half-toward-+Infinity), pinned isomorphically
by the Track A golden vectors — a new `eval_vectors_test.go` harness runs
every `eval-vectors.json` case in Go and matches the JS reference exactly.

Purely additive: the new functions are not yet wired into emit, so all
existing template output stays byte-identical and no adapter
`createSourceFile` is added. Migrating the emit path onto the evaluator
(and the byte-equal decision for the won't-fix `localeCompare` string
sort) is the follow-up integration.
