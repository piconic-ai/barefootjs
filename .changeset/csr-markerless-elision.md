---
'@barefootjs/jsx': patch
'@barefootjs/blade': patch
'@barefootjs/erb': patch
'@barefootjs/go-template': patch
'@barefootjs/jinja': patch
'@barefootjs/mojolicious': patch
'@barefootjs/rust': patch
'@barefootjs/twig': patch
'@barefootjs/xslate': patch
---

Fix a real SSR/CSR divergence in the compiled client JS for a bare (non-loop) `/* @client */` text expression: the standalone CSR template — `generateCsrTemplateWithOpts` in `packages/jsx/src/ir-to-client-js/html-template.ts`, used for `registerTemplate()`'s CSR fallback — never consulted `IRExpression.markerless` before emitting the `<!--bf:sN-->…<!--/-->` marker pair, so it kept the markers even where `client-only-elision.ts` had already decided (before either SSR or CSR generation runs) that the whole marker pair could be dropped. SSR already elided the marker pair correctly for this shape; a fresh (non-hydrating) CSR mount did not, and a hydrating mount claiming via `elidedPath` also embedded the extra dead marker comments. `generateCsrTemplateWithOpts` now emits nothing for a markerless `clientOnly && slotId` expression, matching SSR byte-for-byte and matching what `irToHtmlTemplate`'s own `markerless` check already did for its (different) domain (#2617).

**Emitted-output effect**: any bare, non-loop `/* @client */` text expression compiled today loses two marker comments from its compiled client JS template (e.g. `<strong bf="s1"><!--bf:s0--><!--/--></strong>` becomes `<strong bf="s1"></strong>`). This is strictly a byte-size/parity fix — no behavioral change for hydration or fresh-mount rendering, since the claim plan already resolves this position via a precomputed child-index path (`elidedPath`), not a marker scan.

`@barefootjs/jsx`'s escape-coverage-adjacent adapter packages (`blade`, `erb`, `go-template`, `jinja`, `mojolicious`, `rust`, `twig`, `xslate`) each drop `unescapable: { issue: '.../2613' }` from seven `conformance-pins.ts` entries (`fill-unsupported`, `find-typeof-predicate`, `some-typeof-predicate`, `every-typeof-predicate`, `reduce-typeof-body`, `reduce-right-typeof-body`, `flatmap-typeof-projection`) now that each fixture's `/* @client */` escape twin is a verified, CSR-conformant escape — declaration-only, no runtime behavior change on these packages themselves (their own SSR output was never affected by this bug).
