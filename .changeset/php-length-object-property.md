---
'@barefootjs/php': patch
---

`length()` on an object now returns its own `length` property (null when it has none) instead of `0`, so an object row's `length` field read in a filter predicate (`rows().filter(r => r.length > 2)`) keeps the matching rows on Blade and Twig.
