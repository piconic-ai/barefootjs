---
"@barefootjs/go-template": patch
---

Extract the Go html/template adapter's constructor-context expression lowering into `memo/ctor-lowering.ts` (Roadmap B). Internal-only, output byte-identical (verified by the adapter unit + conformance suites); no behavioural or public-API change.

- `memo/ctor-lowering.ts` — `lowerCtorExpr`, `lowerCtorCond`, `lowerCtorStringArray` moved out as pure free functions (mutually recursive). They lower the narrow surface of JS expressions a derived-state memo needs (#1897) into Go constructor code: literals, `<sp>.get('k')`, `<arr>.includes(<x>)`, module arrow-helper inlining, `?? `/`||`/`? :` string forms. They read only `state.localConstants` / `state.propsObjectName` / `state.needsStringsImport` and `parseLiteralExpression`.
- No new `GoEmitContext` member is needed; the two external call sites now call `lowerCtorExpr(this.emitCtx, …)`.
