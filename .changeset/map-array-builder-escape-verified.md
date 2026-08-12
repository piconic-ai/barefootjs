---
'@barefootjs/blade': patch
'@barefootjs/erb': patch
'@barefootjs/go-template': patch
'@barefootjs/jinja': patch
'@barefootjs/mojolicious': patch
'@barefootjs/rust': patch
'@barefootjs/twig': patch
'@barefootjs/xslate': patch
---

Removes the `unescapable` declaration from each adapter's `map-array-builder-body` / `map-array-builder-escaping` conformance pins (#2613). These two fixtures still refuse the imperative array-builder `.map()` body with BF021 on every DSL adapter, but the `/* @client */` escape is now verified with an executable twin (`map-array-builder-body-client`) rather than merely asserted in a docstring: it compiles clean and produces zero diagnostics on all 8 DSL adapters, and its CSR template renders the empty host correctly.

No runtime or emission behavior changes — the BF021 refusal is unchanged; only the escape-coverage declaration is corrected from "owed but unverified" to "verified."
