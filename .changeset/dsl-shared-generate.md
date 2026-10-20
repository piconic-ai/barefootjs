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

The `generate()` the eight DSL template adapters copied, and the per-compile state it sets up, live once in `@barefootjs/jsx` as `DslTemplateAdapter`. Each adapter supplies only its diagnostic name, its reserved-name spelling, its own extra state, its script registrations and its two seeds. The compiled templates are unchanged.
