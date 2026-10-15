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

`isBooleanTypedPropRef`, `parseUndefinedAlternateTernary` and the child-template naming (`childTemplateName`) live once in `@barefootjs/jsx` instead of in each DSL adapter. The compiled templates are unchanged.
