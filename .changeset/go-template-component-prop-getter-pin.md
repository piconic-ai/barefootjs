---
"@barefootjs/go-template": patch
---

Pins a newly-discovered divergence on the `component-prop-bare-getter` conformance fixture (#2760): a plain (non-Context) child-component prop whose value is a local signal/memo getter compiles clean but renders empty on Go's real backend — `NewCounterProps`'s constructor-time build of the nested child's `Input` struct silently omits the field. Predates #2760 and reproduces identically with the object-literal-wrapped form; tracked at #2925.
