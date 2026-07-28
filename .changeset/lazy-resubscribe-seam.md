---
"@barefootjs/client": patch
---

Add a re-subscribe seam to `mapArrayLazy`'s loop-level outer effect.

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

Every loop with an `applyOuter` now re-runs it after any reconcile that
created a row or changed an item (removals strand nothing). This is
deliberately unconditional rather than gated on a compiler judgement about
which outer reads are per-key: that gate would turn a MISCLASSIFICATION into
a silent staleness bug, while unconditional makes the same mistake merely
wasteful. Forcing it on for a loop that does not need it measured below this
repo's benchmark floor (post-hydration heap 1815.5KB -> 1809.1KB, i.e. it
came out lower — noise, not signal).

This inverts the earlier contract that a reconcile never re-runs the outer
effect; the test that pinned it is updated with the reason.
