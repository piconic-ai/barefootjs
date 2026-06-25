---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

Carry the parsed condition tree in the IR (continuing the "IR carries semantics, adapters emit from it" direction). Output byte-identical; the only public-API change is additive.

- `@barefootjs/jsx`: `IRConditional` and `IRIfStatement` gain an optional `parsedCondition` (`parseExpression(condition.trim())`), attached by the `jsxToIR` walk. Optional/best-effort like `IRExpression.parsed`.
- `@barefootjs/go-template`: `convertConditionToGo` takes an optional pre-parsed tree; `renderConditional` and `renderIfStatement` (incl. else-if chains) pass `parsedCondition`, so a rendered condition reuses the IR's parse instead of calling `parseExpression` again.
