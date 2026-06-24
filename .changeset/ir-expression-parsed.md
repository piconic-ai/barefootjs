---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

Carry the parsed expression tree in the IR for text-interpolation nodes, so SSR adapters emit from it instead of each re-parsing the string at emit time (and a multi-adapter build parses it once, not per adapter). Output byte-identical; the only public-API change is additive (`IRExpression` gains an optional `parsed` field).

- `@barefootjs/jsx`: `jsxToIR` now walks the produced tree and attaches `IRExpression.parsed` (`parseExpression(expr.trim())`) to every text-interpolation node. Best-effort — a node left without `parsed` (or an empty expr) just falls back to adapter-side parsing, so it is never a behavioural change.
- `@barefootjs/go-template`: `convertExpressionToGo` takes an optional pre-parsed tree and `renderExpression` passes `expr.parsed`, so a rendered interpolation reuses the IR's parse instead of calling `parseExpression` again. The string-based early returns (null/undefined, static record index, inlined consts, helper/url lowering) are unchanged and still run first.
