---
'@barefootjs/go-template': patch
---

A `.filter()` predicate inside a nested loop now reads an enclosing row's item param, index or destructure binding, instead of lowering it to a root-scope field that the Props struct does not have (#3396).
