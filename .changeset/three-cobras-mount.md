---
"@barefootjs/jsx": patch
---

Fix #3009: a `ref` on an element inside a keyed `.map()` row's conditional branch now (re-)fires on every branch activation, not just once at row creation. `collectLoopChildRefs` previously descended straight through a nested reactive conditional and hoisted the ref to row level, where it only ran once per `mapArray` renderItem call — so a branch that started inactive, or that a row's key round-tripped away from and back to, never got its ref (re-)run. Branch-interior refs are now collected onto `LoopChildBranchSummary.refs` (mirroring `events`) and emitted inside that branch's own `insert()` bindEvents.
