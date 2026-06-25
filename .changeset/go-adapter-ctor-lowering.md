---
"@barefootjs/go-template": patch
---

Extract the Go html/template adapter's constructor-context expression lowering into `memo/ctor-lowering.ts` (Roadmap B). Internal-only, output byte-identical (verified by the adapter unit + conformance suites); no behavioural or public-API change.

- `memo/ctor-lowering.ts` — `lowerCtorExpr`, `lowerCtorCond`, `lowerCtorStringArray` moved out as free functions (mutually recursive). They lower the narrow surface of JS expressions a derived-state memo needs (#1897) into Go constructor code: literals, `<sp>.get('k')`, `<arr>.includes(<x>)`, module arrow-helper inlining, `?? `/`||`/`? :` string forms. They read `state.localConstants` / `state.propsObjectName` and `parseLiteralExpression`, and set `state.needsStringsImport` when they emit a `strings.*` call.
- No new `GoEmitContext` member is needed; the two external call sites now call `lowerCtorExpr(this.emitCtx, …)`.
