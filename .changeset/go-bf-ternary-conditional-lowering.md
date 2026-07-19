---
'@barefootjs/go-template': patch
---

Go adapter: unify value-position conditional lowering on the pipeline `bf_ternary` helper (#2335). The ParsedExpr `conditional()` emitter, boolean sub-conditions, and attribute-value ternaries now all lower to `(bf_ternary <test> <a> <b>)` instead of `{{if}}…{{end}}` action fragments, deleting the fragment special-casing. This also fixes a correctness bug: a ternary used as a boolean sub-condition (`(x ? y : z) && w`) previously returned only its `test`, silently discarding both branches; it now lowers faithfully. The ternary test is coerced to a real Go bool via the new `bf_truthy` runtime helper (JS `Boolean(x)` semantics) when it isn't already a comparison/negation.
