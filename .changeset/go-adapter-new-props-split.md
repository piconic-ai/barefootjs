---
"@barefootjs/go-template": patch
---

Split the self-contained sections out of the Go adapter's ~590-line `generateNewPropsFunction` into focused private emitters (readability). Internal-only, output byte-identical (verified by the adapter unit + conformance suites); no behavioural or public-API change.

- `emitNewPropsDocComment` — the `NewXxxProps` doc header + per-component "handler-populated slice" NOTE.
- `emitStaticChildInstances` — the ~145-line static child-component instance emitter (props, rest-bag routing, context bindings, children passthrough).
- `emitSpreadBagInits` — spread-bag field initializers + the BF101 fallback.

These stay as adapter methods (orchestrator), just no longer inline. The loop-body wrapper builders (which share `emittedWrapperVars` / `propFallbackVars`) are left for a follow-up.
