---
'@barefootjs/jsx': patch
'@barefootjs/blade': patch
'@barefootjs/erb': patch
'@barefootjs/jinja': patch
'@barefootjs/mojolicious': patch
'@barefootjs/pebble': patch
'@barefootjs/rust': patch
'@barefootjs/twig': patch
'@barefootjs/xslate': patch
---

The DSL adapters decide a loop's destructure gate, static source, computed-const refusal, sort lowering and filter-capture aliases through one shared plan in `@barefootjs/jsx` (`planLoop`). The compiled templates are unchanged.
