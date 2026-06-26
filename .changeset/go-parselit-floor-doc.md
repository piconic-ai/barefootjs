---
"@barefootjs/go-template": patch
---

Document `parseLiteralExpression` as the terminal sweep's architectural floor — the last `ts.createSourceFile` in the adapter, a shared 13-caller parser whose removal requires expanding the shared `ParsedExpr` into a near-complete expression AST (tracked in #2006). Docstring-only; no behavioural or API change.
