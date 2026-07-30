---
"@barefootjs/jsx": patch
---

Hoist the lazy row graph's per-loop claim-plan literal (slot unification §9)

`mapArrayLazy`'s emitted `createRow`/`__lzc_<mid>` claim built a fresh
`ClaimPlan` array (one `{ id, kind, path }` object per text slot, plus a
fresh inner `path: []` array in the adopted-row form) on EVERY row, even
though the plan's contents never vary across rows of the same loop. A
`ClaimPlan` is `readonly SlotSpec[]` and `claimRefs` only ever reads it —
`claimSlots`/`claimRefs` build a fresh `Map` per call — so one shared plan
object is safe for every row.

The stringifier now hoists this as a loop-level const: `__lzs_<mid>` for
the adopted (SSR) row context, and `__lzsc_<mid>` for the fresh-CSR-clone
context (only emitted when it differs, i.e. when the loop has a hoisted
skeleton with compile-time text paths). For a loop with N rows and one
text slot this removes ~2N object/array allocations; SSR output and
everything else about the emission (door choice, ref ordering,
`applyItem`/`applyOuter`/`createRow` bodies) is unchanged.

Measured on `benchmarks/apps/barefoot` with
`bench-dom.ts --quick --framework=barefoot`: heap for 1k rows
1053.8KB -> 971.9KB / 970.5KB over two after-runs, ~-82KB (-7.8%).
`create1k` time stayed inside run-to-run overlap. Emitted JS grows
+29 bytes per lazy loop (+0.1KB gzip on that app) — two const lines per
loop in exchange for two fewer allocations per row.
