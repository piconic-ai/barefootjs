---
"@barefootjs/go-template": patch
---

Comparisons (`===`, `!==`, `<`, `<=`, `>`, `>=`) now follow JavaScript numeric semantics on go-template. They used to lower to `html/template`'s builtin `eq` / `ne` / `lt` / `le` / `gt` / `ge`, which refuse mixed basic kinds, so comparing a fractional `number[]` element (`float64`) with an integer literal, such as `value > 0` with `1.5`, failed at render time with `incompatible types for comparison`. They now go through new `bf_eq` / `bf_ne` / `bf_lt` / `bf_le` / `bf_gt` / `bf_ge` runtime helpers, which compare numbers of any Go kind by value.
