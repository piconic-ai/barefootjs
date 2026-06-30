---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

Lower the searchParams-derived object memo (#2015) through the general fold instead of a bespoke statement walk (#2040, PR-C of the memo follow-up stack).

`computeObjectMemoInitialValue` previously walked `parsedBlock` for `const sp = searchParams()` bindings + a terminal `return { … }`. It now folds the block with `foldBlockToExpr`, adding `searchParams` to the purity oracle (an idempotent request-query read, safe to inline at each `sp.get('k')` site), and lowers the resulting object-literal. `sp` is inlined to `searchParams()`, so `lowerCtorExpr` now recognises a `searchParams().get('k')` receiver in addition to the `const sp` env form. `foldBlockToExpr` is exported from `@barefootjs/jsx`.

This drops the statement-shape matching (var-decl scan + last-return check) for the object memo, and as a side benefit lowers an object memo that calls `searchParams().get('k')` directly without a `const` binding. A block that doesn't fold to an object literal returns null → the same nil fallback as before. Render parity verified by the Go adapter conformance + unit suites.
