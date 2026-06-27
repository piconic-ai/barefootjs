---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

Lower the object-returning `searchParams()` memo from the analyzer-carried `parsedBlock` instead of re-parsing `computation` with `ts.createSourceFile` (terminal sweep, #2006).

- `@barefootjs/jsx` — add `parsedExprToParsedExpr2`, a pure structural `ParsedExpr` → `ParsedExpr2` converter for the object-memo value surface; the block-body tolerant parser (`parseStatement`) now also carries `object-literal` var-decl inits and returns (an object-literal return is parenthesised to force expression context), completing the Roadmap A-1 deferral.
- `@barefootjs/go-template` — `computeObjectMemoInitialValue` walks `MemoInfo.parsedBlock` / `parsedBlockComplete` and lowers each return-object property via `parsedExprToParsedExpr2` + `lowerCtorExpr`, dropping the adapter's last `parseLiteralExpression` (`ts.createSourceFile`) call.

Byte-identical Go output (786 adapter-conformance / 553+3-skip go-template tests stay green); no public-API or behavioural change.
