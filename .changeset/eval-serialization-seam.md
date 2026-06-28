---
"@barefootjs/jsx": patch
---

Add `serializeParsedExpr` and `freeVarsInBody` — the compiler-side seam for the
runtime callback-body evaluator (#2018). `serializeParsedExpr` lowers a pure
higher-order callback body (`ParsedExpr`) to the minimal JSON the Go/Perl
evaluators consume, emitting only the evaluator-read fields per kind and
returning `null` for any shape outside the evaluator's pure-expression surface
(folded `higher-order`/`array-method`, `arrow-fn`, unsupported nodes, or an
operator the evaluator doesn't implement) — the compile-time purity gate.
`freeVarsInBody` reports the captured free variables a body references (for the
evaluator's `base_env`). Additive and not yet wired into any adapter, so output
is unchanged; these are consumed in the follow-on phases that route sort /
reduce / filter / map callbacks through the evaluator.
