---
"@barefootjs/go-template": patch
---

Untyped object-array signal struct synthesis now reads the analyzer-carried `signal.parsed` tree instead of re-parsing `initialValue` with `ts.createSourceFile` (`parseLiteralExpression`). Byte-identical output (786 adapter-tests / 556 go-template).
