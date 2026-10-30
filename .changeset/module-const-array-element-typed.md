---
"@barefootjs/jsx": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
"@barefootjs/go-template": patch
---

A module array const element read with a literal index (`QS[0]`) is now resolved to the element's typed expression (`lookupStaticArrayElement`). The template spells it exactly as if the source had written the element in place, instead of using a display string made before the expression's context was known. A `-0` element is now `-0` in arithmetic, as a written `-0` is, and no longer becomes `0`.
