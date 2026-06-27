---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

Go constructor lowering now reads `ConstantInfo.parsed2` / `ParsedExpr2` instead of re-parsing const values with `ts.createSourceFile`. The four `parseLiteralExpression` call sites in `ctor-lowering.ts` (and the derived-const caller in `go-template-adapter.ts`) are removed; `lowerCtorExpr` / `lowerCtorCond` / `lowerCtorStringArray` take the IR-carried `ParsedExpr2` tree, and a new `tsNodeToParsedExpr2` bridge converts the return-object initializers in `memo-value.ts`. Go-only (mojo/xslate untouched); output is byte-identical (786/556 conformance + Go suites).
