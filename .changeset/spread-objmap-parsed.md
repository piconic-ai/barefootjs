---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

Lower a spread bag's signal object-literal initial value (`{...attrs()}` where
`attrs` is `createSignal({ ... })`) from the carried IR tree instead of
re-parsing with `ts.createSourceFile`. The analyzer now parenthesises a signal's
`initialValue` before parsing (`(${initialValue})`), so a bare object-literal
init resolves to an `object-literal` `ParsedExpr` rather than being read as a
block — `parseExpression` unwraps the parens, so array / scalar / prop-ref inits
(the existing consumers) are unchanged. The Go spread codegen reads
`signal.parsed` via a new `parsedObjectLiteralToGoMap`; a non-object / spread /
computed init leaves `parsed` absent or non-object, returning null exactly as
the former string parser did. Byte-identical — verified by go unit (556),
conformance (786), and jsx unit (2216). Drops the adapter's package-wide
`ts.createSourceFile` count by one.

Also adds an optional `ObjectLiteralProperty.keyKind` (`identifier` / `string` /
`numeric`) to the shared `ParsedExpr` so the spread lowering can keep rejecting
numeric object keys (`{ 1: 'a' }`) exactly as the former parser did — `key`
normalises numeric and string keys to the same text. Additive and optional;
other consumers ignore it.
