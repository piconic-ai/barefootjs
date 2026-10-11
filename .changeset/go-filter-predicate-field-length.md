---
'@barefootjs/go-template': patch
---

`.length` on a loop item's field inside a `.filter()` predicate (`items().filter(i => i.name.length > 2)`, `i.tags.length > 0`) now reads the field's length instead of matching nothing. A signal seeded with an object literal that holds an empty array field (`{ name: 'a', tags: [] }`) is no longer baked as `nil` as a whole.
