---
"@barefootjs/client": patch
---

Keep a multi-root item's extras reachable when its primary is already attached

`itemRootElements` (`qsa-item.ts`) yields an item's roots in three steps: the
primary, then its siblings up to a loop-boundary comment, then the CSR-only
`__bfExtras` stash holding extras that are not siblings yet. Step 2 ended with
`return`, which ends the generator — so hitting a boundary skipped step 3
entirely.

That was invisible in every shipped path. Nothing attaches a row before its
`renderItem` body runs, and with a detached primary `nextSibling` is `null`:
the walk never executes and control reaches the stash regardless. Attach the
primary first and the very first sibling is a boundary comment, the generator
ends, and `upsertChildItem` reports the item's child placeholders as missing —
leaving them unreplaced in the DOM.

`break` bounds the sibling walk without ending the generator. The boundary's
purpose is preserved: the walk still stops there, and the only thing consulted
afterwards is the item's own stash, which `mapArray` deletes once the body has
returned (`map-array.ts`), so no element is ever yielded twice.

This ships on its own as a no-op: with nothing attaching rows early, the `break`
is never reached before the stash would have been read anyway. It is a
prerequisite for the connect-before-init work on rows whose root is a template
clone — a child inside such a row runs `init` against a detached element, and
`useContext` resolves by walking `parentElement`, so it falls through to the
global last-writer-wins store and reads another provider's value. Fixing that
means attaching the row before the body's tail, which is exactly the case this
`return` broke.

Worth recording because the previous comment here explained the detachment
dependency as the sibling walk "running past the item's own roots into a
neighbouring item's elements". That is not what happened: the walk stopped
correctly at the boundary and then gave up before the stash. The failure was
measured, not deduced, and the comment is corrected to match.
