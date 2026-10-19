---
"@barefootjs/client": patch
---

A text update on a comment-scoped component whose root also carries its own scope now lands in that component's own text slot. Before, `$t` could pick a same-numbered slot inside a nested child component and write the update there; it now uses the same ownership rule as slot claiming.
