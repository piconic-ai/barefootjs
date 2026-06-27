---
"@barefootjs/go-template": patch
---

Resolve static `Record`-index lookups (`variantClasses[variant]`, icon registries) from the IR-carried `object-literal` tree instead of re-parsing the const value with `ts.createSourceFile` at emit time. Numeric record values now emit `literal.raw` — TypeScript's normalised `NumericLiteral.text` token (not the source spelling), which is exactly what the adapter's numeric lowering already emits, so the result is byte-identical to the former parse without a second `parseFloat`. Verified byte-identical by the conformance (786) and Go unit (556) suites.
