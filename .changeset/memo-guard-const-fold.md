---
"@barefootjs/jsx": minor
"@barefootjs/go-template": patch
---

Lower the guard-and-return-const block memo (#1897 / #1945) through the folded expression instead of a bespoke statement walk (#2040, PR-B of the memo follow-up stack).

The analyzer now folds a complete, value-producing block-bodied memo into a single `MemoInfo.parsed` expression (`foldBlockToExpr`), runs after all signals/memos are collected so idempotent reactive getter reads (`const k = getter()`) count as pure and a guard read across several branches still folds. An incomplete or unfoldable block leaves `parsed` undefined and consumers keep their `parsedBlock` fallback.

The Go adapter's `resolveBlockBodyMemoModuleConst` is rewritten to read the folded `MemoInfo.parsed` conditional (`!getter() ? MODULE_CONST : <derived>`) rather than walking `var-decl`/`if`/`return` statements with a local-var→signal map — the per-idiom statement matcher is gone, the recognition rides the general fold. The guard-falsy-init → module-const baking is unchanged.

Render parity verified: Go + Perl adapter conformance green; Go/Mojo/Xslate adapter unit suites green; the jsx suite carries only the pre-existing checker-alias failures.
