---
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
---

Declare the render divergence of a string and a number joined with `+` (`r.id + '-' + i`), which the template language rejects with a type error, against the `string-number-plus-concat` limitation.
