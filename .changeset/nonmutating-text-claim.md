---
"@barefootjs/client": patch
---

Make claiming a `'text'` slot non-mutating, and add `lazyClaimSlots` — the
read-capable twin of `lazySlots`.

A text claim used to call `textNodeAfterComment`, which CREATES and inserts
an empty Text node when SSR rendered the slot empty, so merely claiming a
row mutated the DOM. A marked text slot now holds ONE field — the live Text
node once materialized, or the anchor Comment to create it after — and the
node is created by the first write that needs it. Post-write DOM is
identical to before; inspecting a slot now leaves nothing behind.

That unlocks the read half of read-compare-write seeding
(`spec/slot-unification.md` §9.3(1)), which content slots previously had no
door for. It ships as a separate `lazyClaimSlots` / `ClaimedSlotsRW` pair
rather than a `read` on every claim: doors are allocated per row, so giving
every row a reader costs closures on rows that never read (measured
+84KB/1k rows for a reader on every writer, +40KB for a reader on every
claim). Both shapes sit on the same claim — a second accessor bundle, never
a second way to resolve a position.
