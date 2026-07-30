---
"@barefootjs/client": patch
---

Connect a `createComponent` loop row before its `init` runs, so `useContext`
resolves the row's own provider instead of the last one that hydrated on the
page.

The child-slot path already had this guarantee: `upsertChild` hands its
placeholder to `createComponent` as `mountAt`, and `materializeComponent`
replaces the placeholder *before* calling `initFn` (step 7b) precisely because
`useContext` resolves by DOM position. A loop row had no placeholder to hand
over, so it kept initialising detached and fell through to the global,
last-writer-wins context store. With two providers of the same context on one
page — two `<Flow>` blocks, each rendering nodes through `mapArray` — a node
created after the sibling flow had hydrated resolved the **wrong** flow's
store.

`mapArray` now hands the row's container and trailing anchor down through a
`setRowMountPoint` ambient, taken-and-cleared by the outermost
`createComponent` inside `renderItem`, which connects there before running
`init`. The ambient is the same shape as the `_parentScopeId` one that already
lives in `component.ts`, and take-and-clear is what keeps a nested
`createComponent` from the row's own init from re-using the row's mount point.

**The reorder is deliberately left alone.** A mounted row now appears in the
LIS walk like any other attached scope, and the LIS argument — keep the longest
already-correctly-ordered run stationary, insert every other run before the
next stationary scope — never depended on new rows being absent from that walk;
it only needs `domOrderIndices` to reflect the live DOM, which it still does.
Pinned by a reorder test that inserts a fresh row at the front and then
reverses a three-row list.

The ambient carrying the mount point is a single slot, so `mapArray` saves and
restores whatever it found rather than clearing to `null`, and only touches the
slot when it is the one setting it. A row whose own `init` drives a nested
`mapArray` would otherwise have the inner list strand the outer row's
not-yet-claimed mount point and silently revert it to init-detached.

One cost is inherent rather than incidental: a bulk append of component rows no
longer collapses into a single `DocumentFragment` insert, because each row must
be in the live document before its own `init` runs, and a fragment is not the
live document. The insertions move earlier (one per row, inside
`createComponent`) instead of disappearing — the reorder step then finds the
parked order already correct and performs zero mutations. Template-clone rows
keep the batched path untouched.

Two shapes stay on the old path, both intentionally:

- **Multi-root rows.** A Fragment loop body's extras and per-item marker only
  exist once `renderItem` has returned, so `createItemScope` un-parks a row
  that turns out to carry extras rather than leaving it in the DOM without
  them. This also preserves `qsa-item.ts`'s step-3 contract, which needs the
  primary detached during setup. Expected to be dead code — a multi-root body
  never takes the `createComponent` row path.
- **Composite / plain rows.** Their root is a template clone, never a
  `createComponent`, so there is no call to hand a mount point to and their
  nested `upsertChild` children still init against a detached row. Closing
  that needs the emitted renderItem body to hand its element over before the
  tail runs — a compiler change, pinned as a skipped test in
  `csr-loop-row-init-connected.test.ts`.

Deferring the row's `init` instead — the other obvious fix — is the wrong
seam and is documented as such in that test file. `createComponent` is atomic:
getter `children` are evaluated *after* `initFn` so the row's own providers are
in place first, and the renderItem tail's `insert(__csrEl, '^sN', …)` calls
resolve conditional-slot markers that live inside exactly that getter-children
HTML. Deferring init defers those markers into existence, leaving per-row
branch slots unwired.

Measured: the two previously-skipped tests in
`packages/client/__tests__/runtime/csr-loop-row-init-connected.test.ts` now
pass (client suite 608 pass + 2 skip → 610 pass); adapter and CSR conformance
1456 pass / 0 fail; the full `site/ui` Playwright suite green on CI across all
four shards.
