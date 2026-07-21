---
'@barefootjs/jsx': patch
---

Fix an element inside a (possibly nested) per-item conditional in a `mapArray` loop being bound twice when it also carried a dynamic attribute and/or event handler (#2347). Previously such bindings were duplicated between the loop item's own initial template query and the conditional's `insert()` bindEvents, causing event handlers to fire twice and attribute effects (e.g. `class`) to go stale after a branch swap. Both are now bound exactly once, scoped to the innermost conditional arm that actually owns the element.
