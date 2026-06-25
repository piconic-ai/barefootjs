---
"@barefootjs/go-template": patch
---

Extract the Go html/template adapter's block-body / object memo value computation into `memo/memo-value.ts` (Roadmap B). Internal-only, output byte-identical (verified by the adapter unit + conformance suites); no behavioural or public-API change.

- `memo/memo-value.ts` — `resolveBlockBodyMemoModuleConst` (recognise a guard-and-return-module-const memo, reading `state.localConstants`) and `computeObjectMemoInitialValue` (lower a `searchParams()`-derived object-returning memo to a Go `map[string]interface{}` literal via `lowerCtorExpr`, reading `state.searchParamsLocals`) moved out as free functions.
- No new `GoEmitContext` member is needed; call sites now use `…(this.emitCtx, …)`.
