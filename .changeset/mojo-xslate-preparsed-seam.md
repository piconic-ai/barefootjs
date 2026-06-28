---
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

Remove the spread-lowering `ParsedExpr` round-trip in the Mojolicious and Xslate adapters (#2018).

The conditional-spread / object-literal spread codegen previously re-stringified the IR-carried `ParsedExpr` tree (`stringifyParsedExpr`) and routed it back through `convertExpressionToPerl` / `convertExpressionToKolon`, which re-parsed the text. The seam now matches go-template's `convertExpressionToGo(jsExpr, out?, preParsed?)`: the converters accept an optional `preParsed?: ParsedExpr` and thread the carried tree straight through, eliminating the stringify→re-parse round-trip. Output is byte-identical (the carried tree is exactly what re-parsing the stringified text produced). `stringifyParsedExpr` is retained only for BF101 diagnostic message text.
