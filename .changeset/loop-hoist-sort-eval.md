---
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

Lower the `.sort().map()` loop-hoist comparator through the runtime evaluator
(#2018, P3). The chained-sort site that wraps a loop's iterable now serializes
the comparator body and emits `bf_sort_eval` / `bf->sort_eval` / `$bf.sort_eval`
(the same path the standalone `.sort(cmp)` value call uses since P1), with
captured free vars threaded as the env argument. A comparator the evaluator
can't model (e.g. `localeCompare`, including a `||`-chain that ends in one)
falls back to the legacy structured `bf_sort` / `bf->sort` path, so behavior
there is unchanged. Rendered HTML is unchanged; only the emitted template text
moves to the evaluator helper. The `.filter().map()` loop gate stays an inline
`{{if}}` / `: if` on the raw predicate (already de-folded). This removes the
last standalone consumer of the structured `SortComparator` outside the parser,
ahead of collapsing the folded `ParsedExpr` model.
