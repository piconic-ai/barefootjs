---
"@barefootjs/go-template": patch
---

Extract the Go html/template adapter's memo initial-value computation core into `memo/memo-compute.ts` (Roadmap B). Internal-only, output byte-identical (verified by the adapter unit + conformance suites); no behavioural or public-API change.

- `memo/memo-compute.ts` — the six mutually-recursive memo-value functions moved out as free functions: `computeMemoInitialValue` (typed-field entry, zero-value defaulting), `computeMemoInitialValueOrNull` (pattern-matching core), `memoInitialFromParsedBody` (structural match over the analyzer-attached `parsed` tree), `computeComparisonTernaryGo`, `resolveComparisonOperandGo`, `resolveGetterValueAsGo`. They read `state.currentMemos` / `state.moduleStringConsts` and delegate to the value / type / template-interp / memo-value modules.
- `emit-context.ts` — `GoEmitContext` gains `extractPropFallback` (parallel to the existing `extractPropNameFromInitialValue`), the one adapter-resident parser the core calls back into.
- Removes the now-unused `EMPTY_PROP_FALLBACK_VARS` static from the adapter (all users moved into modules).
