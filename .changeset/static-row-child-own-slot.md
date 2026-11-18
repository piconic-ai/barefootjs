---
"@barefootjs/client": patch
---

Hydration: the rows of a static array are no longer mixed up with a row's own child component. When a row component rendered a child of its own at the same slot number the row is mounted at (a `<Badge>` row at the parent's `s2` whose own `<Dot>` sits at `Badge`'s `s2`), the row lookup also took that child, because its scope id ends in the same `_s2`. The rows were then paired with the wrong array items: after hydration a row showed a later row's values, and the last row lost its own. A child element that names its host and slot (`bf-h` / `bf-m`) is now matched on them alone, as a comment-scoped child already was; the scope-id suffix is only used for one that names neither.
