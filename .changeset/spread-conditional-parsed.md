---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

Carry a `SpreadAttr.parsed` tree on the IR so the Go adapter's conditional inline-object spread codegen lowers from the parsed tree instead of re-parsing the spread source with `ts.createSourceFile` (`parseLiteralExpression`). Additive and best-effort (mirrors `ExpressionAttr.parsed`); the generated Go is byte-identical (786/556 conformance + go-template tests unchanged).
