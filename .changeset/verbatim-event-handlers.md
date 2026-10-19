---
"@barefootjs/jsx": patch
---

The client JS passes an event handler to `addEventListener` as written. It used to rewrite an arrow handler into block form by splitting its text at the first `=>`, which broke a handler whose first `=>` is not the outer arrow's: a conditional choosing between arrows, or a default parameter holding an arrow.
