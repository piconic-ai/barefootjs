---
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/blade": patch
---

Add a RENDER-stage cross-adapter conformance contract (`assertRenderContract` / `renderContractFixture` in `@barefootjs/adapter-tests`) alongside the existing compile-stage conformance corpus -- every adapter bug found in the 0.17-0.18 review was invisible at the compile layer (the compile matrix read 496/496 clean) and only surfaced when a real backend executed the template, e.g. #2157's Ruby `derive_vars_from_defaults` silently dropping a manifest-registered child's `children` prop. Each of ERB, Jinja, minijinja (Rust), Twig, and Blade now runs this contract against its own real render pipeline in its own CI workflow (#2158).

The ERB test harness (`packages/adapter-erb/src/test-render.ts`) also now exercises the exact production `BarefootJS::Context.derive_vars_from_defaults` sequence `register_components_from_manifest` runs in the published gem, instead of a harness-local `defaults.merge(child_props)` shortcut that never touched the code path the #2157 bug lived in -- so the whole ERB conformance corpus, not just a dedicated regression test, now catches this class of regression.
