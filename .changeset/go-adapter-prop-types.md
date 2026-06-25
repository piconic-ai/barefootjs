---
"@barefootjs/go-template": patch
---

Extract the Go html/template adapter's prop-type resolution into `props/prop-types.ts` (Roadmap B). Internal-only, output byte-identical (verified by the adapter unit + conformance suites); no behavioural or public-API change.

- `props/prop-types.ts` — `buildPropTypeOverrides` (signal-inferred Go-type overrides), `resolvePropGoType` (the shared per-field type resolver — optional named-struct props → `map[string]interface{}`), and `collectNillablePropNames` moved out as free functions. They read only `state.localStructFields` and `extractPropNameFromInitialValue` and resolve via `typeInfoToGo`; no new `GoEmitContext` member.

Note: the struct *assembly* generators (`generateInputStruct` / `generatePropsStruct` / `generateNewPropsFunction`) remain on the adapter — they are the orchestrator core that composes the extracted lowering modules (~18 cross-method dependencies), which the architecture deliberately keeps on the object rather than re-exposing through the seam.
