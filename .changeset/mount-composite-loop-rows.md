---
"@barefootjs/client": patch
"@barefootjs/jsx": patch
---

Connect a composite loop row before its children initialise

A loop row whose root is user markup (`items.map(it => <li><Chip/></li>)`) is a
template clone written inline in the emitted body, so no runtime function sits
between "make a row" and "the element exists" and there was nothing to hand a
destination to. `mapArray` first saw the element as `renderItem`'s return
value — after `upsertChild` had already run the row's children's `init`
against a detached element.

`useContext` resolves by walking `parentElement`. A detached element has no
ancestors to walk, so the lookup fell through to the global, last-writer-wins
context store and returned whichever provider on the page wrote last. No error,
no warning — a plausible wrong value. With one provider of a context on the
page it is invisible, because the global holds the same value; put two on one
page and rows in the first list start reading the second's.

Measured, with providers `A` and `B` and a row in `A`'s list: the child read
`B`. With the row connected first it reads `A`.

The compiler now emits `mountRowRoot(clone)`, which consumes the same ambient
mount point `createComponent` row roots already use (#2431), for the one loop
variant that initialises anything inside the row — composite, i.e. nested
components and/or inner loops. A plain row has no nested `init`, so it has
nothing that could resolve wrongly and is left alone; the high-volume
`mapArrayLazy` emission is untouched.

Four things attaching a row earlier could have broken, all checked:

- **The reorder.** A fresh row is mounted at the end of the loop range and the
  LIS walk moves it to its final position. Front-insert, reorder, append and
  removal all reconcile to the right order.
- **Multi-root rows.** A Fragment row is a clone, so it takes this path, and
  `qsa-item.ts`'s lookup used to give up on an attached primary before reading
  the extras stash. That is fixed separately; here the primary mounts, the
  children init connected, and each primary still travels with its own extras
  through a reorder.
- **Cross-row lookups.** Rows are attached while later rows are still being
  built, so a lookup that escaped its own row would now land in a real
  neighbour. Each row gets exactly its own child.
- **A body that throws after mounting.** This one did regress, and is fixed: a
  detached row could never be left on screen, but a mounted one can, so the
  mount is recorded on the mount point and undone before the error propagates.

Left alone deliberately: `createItemScope` still un-parks a row that turns out
to carry extras. By then the mount has already done its job — the tail ran
connected — and un-parking keeps the reorder from marking a row stationary
before its extras and per-item marker exist.

No SSR output change: the hydration branch adopts a row that came from server
markup and is in the document by construction, so it never mounts. This is also
why the change has no CSR-conformance fixture — that layer evaluates the
`template:` lambda and compares HTML, and neither the template nor the HTML
moves here. The behaviour lives in the renderItem body, so the coverage does
too, in `packages/client/__tests__/runtime/`.
