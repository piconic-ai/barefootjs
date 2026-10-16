---
'@barefootjs/go-template': patch
---

A numeric index on an array (`pair[1]`, `groups[0][1]`, or a loop row typed as an array, `entries[0]`) now reads the element through `bf_get` instead of a `.Field0` struct field, which html/template failed to render. A condition such as `entries[1] === 'b'` no longer emits the unparsable `.1`.
