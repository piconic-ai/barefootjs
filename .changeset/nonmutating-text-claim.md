---
"@barefootjs/client": patch
---

Make claiming a `'text'` slot non-mutating, and add the read half of the
claimed-slot door.

A text claim used to call `textNodeAfterComment`, which CREATES and inserts
an empty Text node when SSR rendered the slot empty — so merely claiming a
row mutated the DOM. The claim now adopts an existing Text node when there
is one and otherwise records the insertion site, deferring
`document.createTextNode` to the first write that needs it. End state after
a write is byte-identical to before; what changes is that inspecting a slot
no longer leaves a trail of empty Text nodes.

That unlocks `ClaimedSlots.read(id)` / `lazySlots(...).read(id)`: the read
side of read-compare-write seeding (`spec/slot-unification.md` §9.3(1)),
which previously had no door at all for content slots. Reads go through the
SAME lazy claim as writes — one resolution, held references, no second
lookup path. `null` means "cannot answer" and callers must treat it as
"differs, write it".
