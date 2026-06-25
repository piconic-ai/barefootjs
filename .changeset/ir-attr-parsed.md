---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

Carry the parsed expression tree for intrinsic-element attribute expressions in the IR (continuing the "IR carries semantics, adapters emit from it" direction). Output byte-identical; the only public-API change is additive.

- `@barefootjs/jsx`: `ExpressionAttr` gains an optional `parsed` (`parseExpression(expr.trim())`), attached by the `jsxToIR` walk for each element attribute. Optional/best-effort like `IRExpression.parsed`.
- `@barefootjs/go-template`: the element attribute emitter reuses `value.parsed` for its condition/classification/value lowerings (`convertConditionToGo`, the conditional/template-literal classification parse, and `convertExpressionToGo`), instead of re-parsing the same attribute string up to several times per attribute.
