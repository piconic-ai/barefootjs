---
'@barefootjs/go-template': patch
'@barefootjs/jsx': patch
'@barefootjs/xslate': patch
---

A numeric index on an array (`pair[1]`, `groups[0][1]`, or a loop row typed as an array, `entries[0]`) now reads the element through `bf_get` on Go instead of a `.Field0` struct field, which html/template failed to render; a condition such as `entries[1] === 'b'` no longer emits the unparsable `.1`. On every template adapter, an attribute filled by an index or computed-key read is omitted when the read is out of range or absent, as Hono omits an `undefined` attribute.
