---
"@barefootjs/jsx": patch
---

Fix a CSR template `ReferenceError` regression from the templatePrimitives V2 widening (#2069): a const whose initializer calls a method on a module-scope literal receiver (e.g. `(moduleArray).includes(prop)`) could pass the compiler's raw-form inline-safety check (an adapter with a broad `acceptsTemplateCall`, like Hono's SSR runtime, accepts any identifier-path callee) while the *actual* CSR-substituted form — where the module-scope array has been literal-inlined (`['a','b'].includes(prop)`) — was correctly refused by the same check re-run downstream. The two verdicts disagreeing left the const's name absent from both the CSR substitution map and the unsafe-name set, so the compiler emitted the bare, module-scope-invisible identifier straight into the generated `hydrate()` template instead of degrading to the spec'd `undefined` fallback — throwing at template evaluation.

`generateCsrTemplate` now folds the CSR-substitution layer's own null verdicts into its unsafe-name set, so a name refused there is always treated as unsafe at the CSR template layer, regardless of what the (looser, pre-substitution) classification concluded elsewhere.
