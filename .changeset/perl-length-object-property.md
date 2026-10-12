---
'@barefootjs/perl': patch
---

`bf->length` on a hash ref now returns its own `length` property (undef when it has none) instead of `0`, so an object row's `length` field read in a filter predicate (`rows().filter(r => r.length > 2)`) keeps the matching rows.
