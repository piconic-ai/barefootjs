---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

Make `memo/memo-type.ts` parse-free by classifying memo bodies from the IR
instead of re-parsing `computation` with `ts.createSourceFile`:

- `MemoInfo.bodyIsTemplateLiteral` — the analyzer sets this from the real arrow
  AST node; `inferMemoType` reads it instead of the removed `isTemplateLiteralMemo`
  helper. A no-substitution `` `plain` `` template folds to a plain string
  `ParsedExpr` literal, so a dedicated boolean (not a `parsed.kind` check)
  preserves the backtick distinction.
- `isStringTernaryMemo` now reads the analyzer-carried `MemoInfo.parsed`
  conditional tree (the `moduleStringConsts` membership check stays a plain Set
  lookup in the adapter). A block-bodied memo has no `parsed`, so it returns
  false — matching the former predicate, which never descended a block.

Byte-identical (the analyzer logic mirrors the former adapter predicates over
the same source); verified by go unit (556) + conformance (786). Drops the
adapter's package-wide `ts.createSourceFile` count from 8 to 6 and advances the
constitution's "no expression parsing in adapters" rule by moving the
classification to Phase 1.
