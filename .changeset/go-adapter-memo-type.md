---
"@barefootjs/go-template": patch
---

Extract the Go html/template adapter's memo type-inference predicates into `memo/memo-type.ts` (Roadmap B). Internal-only, output byte-identical (verified by the adapter unit + conformance suites); no behavioural or public-API change.

- `memo/memo-type.ts` — `isTemplateLiteralMemo`, `isBooleanMemo`, `isStringTernaryMemo` moved out as pure free functions. They classify a memo's computation (template-literal / boolean / string-ternary) so `inferMemoType` can pick the right Go field type and SSR zero value. They read only `state.moduleStringConsts` and `extractPropNameFromInitialValue`.
- `inferMemoType` stays on the adapter as the orchestrator that calls the three predicates; no new `GoEmitContext` member is needed.
