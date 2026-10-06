---
"@barefootjs/client": patch
---

Add the runtime groundwork for loop-row elements that a `ref` callback portals out of their row (#3318). A new `row-portal` module records which row and loop container such an element belongs to. A hydrating row claims the element SSR placed at the portal outlet by its slot, owner scope and row key. Delegated loop listeners are relayed to the element, and the element is removed when its row is disposed. `qsaItem`, the claim-plan marker scan and `mapArray`'s key backfill treat the element as part of its row. The compiler does not emit calls to it yet, so rendering is unchanged.
