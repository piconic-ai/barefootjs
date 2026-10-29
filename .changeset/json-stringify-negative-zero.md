---
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
---

`JSON.stringify` of a negative zero now renders `0`, as in JS, on its own and at any depth inside an array or object (`JSON.stringify(-4 % 2)` is `0`, `JSON.stringify([-4 % 2, 1])` is `[0,1]`). ERB rendered `-0.0` and go-template rendered `-0`.
