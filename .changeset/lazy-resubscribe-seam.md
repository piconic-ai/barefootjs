---
"@barefootjs/client": patch
---

Add an opt-in re-subscribe seam to `mapArrayLazy` (`LazyRowPlan.outerNeedsResubscribe`).

`applyOuter` runs in one loop-level effect that subscribes to whatever its
body reads. For a primed signal/memo getter that set is independent of the
entries, so a reconcile can never strand it — the existing contract. For a
per-key subscription such as `createSelector`, whose selector subscribes the
caller only to the keys it was called with, the set DOES depend on the
entries iterated, and three sequences strand it: an empty entry list on the
first run (loop permanently dead), a row created and then selected while no
already-subscribed key flips, and an item change that moves the value a
binding keys on. All three were reproduced before this was written; each is
now a regression test.

A loop that sets the flag re-runs `applyOuter` after any reconcile that
created a row or changed an item (removals strand nothing). Loops that do
not set it are byte-identical to before and pay nothing — the flag exists so
the extra pass lands only where correctness needs it.
