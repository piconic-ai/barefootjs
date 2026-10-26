---
"@barefootjs/jsx": minor
"@barefootjs/test": patch
"@barefootjs/go-template": patch
"@barefootjs/erb": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/blade": patch
"@barefootjs/pebble": patch
---

Keep literal template text separate from interpolation expressions in compiler IR, preserving escaped delimiters and lowering expressions without reparsing string placeholders.

IR consumers must handle the new `expression` template-part variant (`expr`, optional `templateExpr`, and `parsed`). The `string` variant now contains only literal text and no longer has `templateValue`.
