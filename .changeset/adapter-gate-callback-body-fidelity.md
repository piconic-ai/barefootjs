---
"@barefootjs/jsx": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

Adapter-gate the Phase-1 `BF021` refusal for off-subset `filter` predicates and `sort` comparators (callback-body fidelity, Stage 1 of `spec/callback-fidelity.md`).

An off-catalogue `filter` predicate or `sort` comparator (`typeof`, a function call, a nested higher-order method, …) previously raised `BF021` in Phase 1 — before any adapter was consulted — rejecting the code for every target, including JS runtimes whose template engine could run the callback verbatim. The refusal is now adapter-conditional via a new `acceptsCallbackBody` capability on `TemplateAdapter`:

- JS-runtime adapters (`JsxAdapter` — Hono, CSR) accept any `filter`/`sort` callback body and run it as written.
- DSL adapters keep the `BF021` refusal and the explicit `/* @client */` escape to defer the shape to client-only rendering.

SSR/CSR parity is unchanged: per-backend fidelity means per-backend SSR coverage, with the browser as the common fully-faithful floor. Each DSL adapter declares the expected diagnostic for the new `filter-typeof-predicate` conformance fixture via its `conformancePins`.
