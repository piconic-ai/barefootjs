---
"@barefootjs/go-template": patch
---

Finish decomposing the Go adapter's `generateNewPropsFunction` by extracting the two loop-body wrapper builders into private emitters (readability). Internal-only, output byte-identical (verified by the adapter unit + conformance suites); no behavioural or public-API change.

- `emitStaticBodyWrappers` — static nested components WITH body children: bakes the module-const / inline-literal loop array into the constructor and builds the wrapper slice.
- `emitDynamicBodyWrappers` — dynamic loop-body components whose array bakes to a module-const via a memo.

Both take the shared `emittedWrapperVars` set (the return-struct stage reads it). With this, `generateNewPropsFunction` drops from ~590 to ~210 lines — orchestration plus the return-struct field assembly.
