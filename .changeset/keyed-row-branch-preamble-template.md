---
"@barefootjs/jsx": patch
---

A keyed `.map()` row whose callback-preamble local feeds a conditional branch now shows the local's current value when the row is reused and the branch swaps. The branch's `template()` closure read the value from the row's first render, so a same-key row that got new data (the item, the index, or an outer signal) and flipped its condition in the same update showed the old value in the new branch. The compiler now re-runs the row preamble inside the branch template when the branch reads one of its locals.
