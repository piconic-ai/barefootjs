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

The DSL adapters take a loop row's item variable, index local and destructure locals from the shared loop plan (`planLoop`'s `itemVar`, `indexLocal` and `destructureLocals`, spelled with `spellDestructureLocals`). The compiled templates are unchanged.
