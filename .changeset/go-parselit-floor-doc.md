---
"@barefootjs/go-template": patch
---

Document `parseLiteralExpression` as the terminal sweep's final target — the last `ts.createSourceFile` in the adapter, a shared parser (many call sites across the constructor/value lowering) being removed incrementally via the Go-only `ParsedExpr2` bridge (tracked in #2006). Docstring-only; no behavioural or API change.
