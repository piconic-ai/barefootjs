---
"@barefootjs/jsx": patch
---

Fix the CSR template inlining a memo's body against a `.map()` row binding that shadows a name the memo reads (#3352). A memo or inlinable constant read inside a row now resolves its own references in the scope it was declared in, so `label()` under a row param `s` no longer turns the memo's `s()` into a call on the row item (`s is not a function`). When the body reads a module-level name the row param shadows, the value is computed once outside the row.
