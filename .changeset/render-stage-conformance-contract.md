---
"@barefootjs/erb": patch
---

Add a RENDER-stage conformance contract (`assertRenderContract` in `@barefootjs/adapter-tests`) to the shared adapter-conformance runner, anchored by the `counter-buttons` corpus fixture (a stock Counter plus a children-forwarding Button child) -- every adapter bug found in the 0.17-0.18 review was invisible at the compile layer (the compile matrix read 496/496 clean) and only surfaced when a real backend executed the template, e.g. #2157's Ruby `derive_vars_from_defaults` silently dropping a manifest-registered child's `children` prop. Every adapter package's existing `runAdapterConformanceTests` call site picks up the new suite automatically -- no per-adapter wiring needed (#2158).

The ERB test harness (`packages/adapter-erb/src/test-render.ts`) also now exercises the exact production `BarefootJS::Context.derive_vars_from_defaults` sequence `register_components_from_manifest` runs in the published gem, instead of a harness-local `defaults.merge(child_props)` shortcut that never touched the code path the #2157 bug lived in -- so the whole ERB conformance corpus, not just a dedicated regression test, now catches this class of regression.
