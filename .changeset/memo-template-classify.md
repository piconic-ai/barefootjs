---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

Classify a memo's template-literal body on the IR (`MemoInfo.bodyIsTemplateLiteral`)
instead of in the Go adapter. The analyzer sets the flag from the real arrow AST
node at analysis time; the Go adapter's `inferMemoType` reads it rather than
re-parsing `computation` with `ts.createSourceFile` (the `isTemplateLiteralMemo`
helper is removed). A no-substitution `` `plain` `` template folds to a plain
string `ParsedExpr` literal, so a dedicated boolean — not a `parsed.kind` check —
preserves the backtick distinction. Byte-identical (analyzer logic mirrors the
former adapter predicate on the same source); verified by the Go adapter unit +
conformance suites. Advances the constitution's "no expression parsing in
adapters" rule by moving the classification to Phase 1.
