---
"@barefootjs/go-template": patch
---

Resolve static `Record`-index lookups (`variantClasses[variant]`, icon registries) from the IR-carried `object-literal` tree instead of re-parsing the const value with `ts.createSourceFile` at emit time. Numeric record values now emit `literal.raw` (the exact `NumericLiteral.text` token captured by the analyzer), preserving spelling byte-for-byte without a second parse. Verified byte-identical by the conformance (786) and Go unit (556) suites.
