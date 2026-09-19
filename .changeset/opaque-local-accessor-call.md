---
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

Declare the `opaque-local-accessor-call` render divergence: a component-body `const` bound to an opaque call (`const label = makeLabel()`) and invoked in text position lowers to a bare template-variable lookup on every DSL adapter, with no diagnostic, while the reference runs the accessor at render time. Pinned as a `silent` known limitation with a `/* @client */` escape twin; no lowering change yet.
