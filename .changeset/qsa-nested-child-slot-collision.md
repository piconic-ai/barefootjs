---
"@barefootjs/client": patch
---

Fix `qsa()` returning a nested child component's element instead of the caller's own when their compiler-assigned local slot numbers (`bf="sN"`) happen to collide. Compiler slot IDs restart from `s0` per component file, so a parent's own slot and a nested child's slot can share the same number; `qsa()` (used by `insert()`'s conditional-branch `bindEvents` for plain attribute/class bindings) now skips any candidate that falls inside a nested child component's own scope boundary, matching the scope-boundary awareness `find()` already has via `belongsToScope()`.
