---
"@barefootjs/jsx": minor
"@barefootjs/erb": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/blade": patch
"@barefootjs/pebble": patch
---

Use the existing parsed-expression support gate for DSL attribute and spread refusals, removing the redundant regex precheck and its unsupportedAttrExpression / unsupportedAttrExpressionError adapter-helper exports.
