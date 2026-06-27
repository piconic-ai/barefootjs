---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

Inline component-scope arrow helpers structurally, removing the Go helper-inliner's `ts.createSourceFile` re-parses (#2006).

The Go adapter's `inlineLocalHelperCall` no longer parses the call expression or the helper arrow body with `parseLiteralExpression`. It substitutes the call args (carried as the call's `ParsedExpr` `preParsed` tree) into the helper body recovered structurally from `ConstantInfo.parsed2`, then lowers the substituted tree directly — so a compound arg (`props.a ?? props.b`) keeps its precedence by structure instead of the former text-splice parenthesisation. A new `parsedExpr2ToParsedExpr` bridge (the reverse of the `ParsedExpr2` ctor tree) is added to `@barefootjs/jsx` for this.

Output is byte-identical across the affected fixtures (`sortClass` / `tagClass` inliner). The block-bodied `URLSearchParams` URL-builder helpers (`hrefFor` / `sortHref` / `tagHref`) keep their text path — `ParsedExpr2` can't model a statement block, so there's no structured body tree to substitute in.
