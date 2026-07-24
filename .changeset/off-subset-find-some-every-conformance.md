---
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

Lock the per-backend fidelity split for off-subset `.find()` / `.some()` / `.every()` predicates (callback-body fidelity, Stage 1 of `spec/callback-fidelity.md`).

These search/predicate methods already render verbatim on JS-runtime adapters (Hono, CSR) and refuse with BF101 + the `/* @client */` escape on DSL adapters — the split existed but had no conformance coverage. Adds `find-typeof-predicate`, `some-typeof-predicate`, and `every-typeof-predicate` fixtures (a `typeof` guard the evaluator can't lower) and pins each BF101 on all eight DSL adapters, so a regression that either silently mis-lowered them on a DSL backend or refused them on a JS runtime is caught.
