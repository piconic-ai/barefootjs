---
"@barefootjs/go-template": patch
---

Lower a comparison-ternary memo (`() => orientation() === 'vertical' ? A : B`)
from the analyzer-carried `MemoInfo.parsed` tree instead of re-parsing
`computation` with `ts.createSourceFile`. `computeComparisonTernaryGo` and
`resolveComparisonOperandGo` now operate on `ParsedExpr` (a `ParsedExpr`
counterpart of `propsAccessName` resolves the props-object member access). The
predicate only ever matched an expression-bodied conditional — a block-bodied
memo has no `parsed`, so it still returns null. Byte-identical (carousel
`directionClasses` / `positionClasses` / `paddingClass`); verified by go unit
(556) + conformance (786). Drops the adapter's package-wide `ts.createSourceFile`
count from 6 to 5.
