---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

Unify the two expression trees into a single `ParsedExpr`. The Go-adapter
constructor-lowering bridge `ParsedExpr2` (and `ParsedExpr2Property`) is removed;
its two gap shapes — a multi-parameter arrow and a `regex` literal — fold into
`ParsedExpr` (`arrow-fn` now carries `params: string[]`, and a new `regex` kind),
so there is one expression type across every adapter.

The folded-vs-raw distinction (the real reason two trees existed) stays, now
expressed as two parsers and two IR fields of the same type:
`parseExpression2` → `parseExpressionRaw`, `tsNodeToParsedExpr2` →
`tsNodeToParsedExprRaw`, and `ConstantInfo.parsed2` → `parsedRaw` (the raw,
non-folding parse). The structural converter `parsedExpr2ToParsedExpr` becomes a
same-type normaliser `foldInlineHelperBody`, and `parsedExprToParsedExpr2` is
dropped (consumers read the unified tree directly). No output changes — every
adapter's emitted template / client JS is byte-identical.
