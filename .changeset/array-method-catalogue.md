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

The DSL template adapters lower array and string methods (`join`, `slice`, `padStart`, …) through one shared catalogue, `ARRAY_METHOD_CATALOGUE` in `@barefootjs/jsx`, and only spell the runtime helper call. Compiled templates are unchanged.
