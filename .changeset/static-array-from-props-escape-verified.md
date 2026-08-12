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

Removes the `unescapable` declaration from each adapter's `static-array-from-props` / `static-array-from-props-with-component` conformance pins (#2321). These two fixtures still refuse the props-derived, function-scope computed-const loop array with BF101 on every DSL adapter — no DSL template adapter can bind `Object.entries(props.x ?? {}).filter(...)` as a template variable, and that SSR capability gap is unchanged. The `/* @client */` escape is now verified with executable twins (`static-array-from-props-client`, `static-array-from-props-with-component-client`) rather than merely asserted: both are byte-for-byte copies of their bases (plus the one `/* @client */` insertion) that compile clean with zero diagnostics on all 8 DSL adapters, and their CSR templates render the empty host correctly with the loop deferred to the browser.

No runtime or emission behavior changes — the BF101 refusal is unchanged; only the escape-coverage declaration is corrected from "owed but unverified" to "verified." #2321 stays open as the underlying SSR capability gap.
