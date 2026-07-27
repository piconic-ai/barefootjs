---
"@barefootjs/jsx": patch
"@barefootjs/client": patch
---

Fix a CSR memory/update regression introduced by the slot-unification
migration (slot unification A3 → A3b, spec/slot-unification.md §3(c)/§8):
loop-row emission was still wiring one `createEffect` per reactive attr,
per reactive text, and per preamble region — 3 separate effect closures and
subscription-list entries for even the simple two-text-and-one-attr row in
the DOM benchmark's `Bench` table, up from the pre-migration baseline's
same 3 effects but with the new claim-plan writer/`Map`/refs stacked on
top of them.

For the plain-loop-row shape (top-level `mapArray` rows and their
branch-scoped equivalent) the compiler now emits ONE `createEffect` per
row that writes every reactive attr, outer text, and preamble region for
that row through a single claimed-slot writer — outer texts and preamble
regions share one `lazySlots` call (mixed `'text'`/`'markup'` claim
kinds), removing the N-1 extra effect objects and their subscription
entries per row. Composite loops, component loops, the anchored
(whole-item-conditional) loop shape, and static (`forEach`) loops are
unchanged — their `reactiveEffects` never carry preamble regions, and this
pass only touched the shape it could mechanically verify.

Profile mode (`bf debug profile`, #1690) keeps the previous per-slot/
per-attr effect emission so the profiler's `<Component>#binding:<slotId>`
ids still attribute a re-run to its own binding; only normal (non-profile)
builds get the consolidated row effect.

Measured on `benchmarks/apps/barefoot` (CI quick-mode DOM suite,
`benchmarks/runner/bench-dom.ts`): 1k-row memory 2046.4KB → ~1767KB
(-13.6%, within ~0.6% of the pre-migration same-hardware baseline of
1756.9KB); update10th settled back into the ~1.0-1.17x-vanilla band
observed pre-migration. Shipped JS size is materially unchanged (the win
is runtime object count, not source bytes).
