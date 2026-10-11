---
'@barefootjs/mojolicious': patch
---

`.length` now goes through the runtime's `bf->length` for every receiver, which counts an array ref's elements and a string's UTF-16 code units. A string field of a named object type (`user().name.length`) and a loop item's string field inside a `.filter()` predicate (`i.name.length`) no longer die with "Can't use string as an ARRAY/HASH ref".
