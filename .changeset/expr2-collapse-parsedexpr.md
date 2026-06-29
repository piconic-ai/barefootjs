---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

Collapse the two expression models into a single generic `ParsedExpr` (#2018 P5).

The compiler carried two parallel expression trees — the folded `ParsedExpr`
(which pre-extracted higher-order callbacks into specialized `higher-order` /
structured `array-method` kinds at parse time) and the generic `ParsedExpr2`
(call + member + multi-param arrow + regex, no folding). Now that the runtime
evaluator drives every higher-order callback body on both SSR backends (Go
`eval.go`, Perl `Evaluator.pm`), the folding workaround is retired and the two
models are unified on the single generic `ParsedExpr`.

- Higher-order callbacks (`.filter`/`.find`/`.findIndex`/`.findLast`/
  `.findLastIndex`/`.every`/`.some`/`.sort`/`.toSorted`/`.reduce`/`.reduceRight`/
  `.flatMap`) now parse to a generic `call` whose argument is a generic `arrow`;
  the adapter serializes the arrow body to the runtime evaluator (eval-first)
  and recovers a structured comparator (`sortComparatorFromArrow`) only for the
  `localeCompare` sort fallback the evaluator can't model.
- Deleted the folded kinds (`higher-order`, `arrow-fn`, the structured sort /
  reduce / flatMap `array-method` variants), their `extract*FromTS` extractors,
  the `ParsedExpr2` tree, and the `parseExpression2` / bridge functions. The Go
  constructor lowering now reads the single generic `parsed` tree.

Behavior-neutral: emitted SSR template text changes (`bf_sort …` →
`bf_sort_eval … "<json>"`), but rendered HTML is identical across Go, Mojo, and
Xslate (CSR conformance, real Go/Perl render parity, and `eval-vectors`
Go==Perl==JS gate it).
