---
'@barefootjs/erb': patch
'@barefootjs/jinja': patch
'@barefootjs/pebble': patch
'@barefootjs/rust': patch
---

The runtime `length` helper now returns an object's own `length` property (nil/None/null when it has none) instead of `0`. An object row's `length` field read in an inline filter predicate (`rows().filter(r => r.length > 2)`) keeps the matching rows.
