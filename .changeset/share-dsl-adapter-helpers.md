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

The DSL template adapters share one copy of their boolean-result, literal-value, prop-class and component-tree helpers, now exported from `@barefootjs/jsx`. Compiled templates and diagnostics are unchanged.
