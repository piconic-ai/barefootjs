---
'@barefootjs/jsx': patch
---

The client JS of a loop two or more levels deep now reads the enclosing rows' bindings through their accessors (#3397). A nested `.filter().map()` that read the outer row's destructure binding (`tags` from `({ name, tags })`) emitted the bare `tags`, an undeclared identifier at runtime. Each deeper level now gets every enclosing loop's accessor rewrite, composed, not just its immediate parent's.
