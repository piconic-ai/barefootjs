---
'@barefootjs/jinja': patch
'@barefootjs/rust': patch
'@barefootjs/pebble': patch
'@barefootjs/twig': patch
'@barefootjs/blade': patch
'@barefootjs/xslate': patch
---

The Jinja, MiniJinja, Pebble, Twig, Blade and Xslate adapters render a loop's body once. They used to render it twice and drop the first result, which reported a diagnostic in the body twice and doubled the work at each nesting level.
