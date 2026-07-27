---
"@barefootjs/client": patch
---

Add `mapArrayLazy` (plus its `LazyRowPlan`/`LazyRowEntry` contract types) to
`@barefootjs/client/runtime` — the lazy row graph runtime for keyed loops
(spec/slot-unification.md §9, L2 of the stacked series). Rows carry NO
per-row reactive resources: hydration adopts SSR rows with zero DOM
mutations (key read from `data-key`, never written on adopted rows),
item-driven updates are direct reconciler calls into the plan's `applyItem`
with lazy per-row ref claiming, and outer-involving bindings run through ONE
loop-level effect (`applyOuter`) with read-compare-write seeding on its
first run. Keyed diff, duplicate-key warning, clear-all fast path, and LIS
minimal-move reorder mirror `mapArray`'s; `createRow`/`applyItem` run
untracked so the reconciler subscribes only to the loop accessor. No
compiler change yet — the L3 compiler switch targets this entry point for
eligible plain loops.
