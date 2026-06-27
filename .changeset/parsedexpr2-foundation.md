---
"@barefootjs/jsx": patch
---

Add `parseExpression2` / `ParsedExpr2` — a focused, self-contained expression tree for the Go adapter's constructor-context lowering (terminal sweep, #2006). It adds the two shapes the Go ctor/helper/spread lowerers need that `ParsedExpr` cannot model — multi-parameter arrow functions and a regex literal — without touching the shared `ParsedExpr` / `ParsedExprEmitter`, so the other adapters (mojolicious, xslate) are not forced to handle new kinds before their own refactor. Method calls are modelled uniformly as `call` + `member`. Additive and unused for now (no consumer), so output is unchanged; it's the structured replacement that will let the Go adapter drop its last `ts.createSourceFile` (`parseLiteralExpression`).
