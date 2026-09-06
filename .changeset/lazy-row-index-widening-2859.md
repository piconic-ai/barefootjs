---
"@barefootjs/client": patch
"@barefootjs/jsx": patch
---

Follow-on to the #2859 index-accessor fix: the lazy row graph (`mapArrayLazy`, `spec/slot-unification.md` §9) no longer refuses a loop solely because a reactive binding, row conditional, or `.map()` callback preamble references the loop's index parameter. A row's current position is now tracked on `entry.index` the same way its item is tracked on `entry.item`, and the compiler classifies an index-referencing binding as item-driven, so it lands in `applyItem`; the runtime also calls `applyItem` on a pure reorder (no item change) for a plan marked `indexDriven`. This shrinks the eager `mapArray` runtime's footprint to the cases it structurally still needs — a row that owns an imperative ref, a child component, an inner loop, or a multi-root fragment — without touching those. Also extracts the duplicated "wrap item → decide lazy → wrap index" sequence from `build-loop.ts`/`build-branch-loop.ts` into one shared `buildPlainRowCore` helper (`control-flow/plan/build-plain-row.ts`), and fixes a latent gap the duplication had left: a `ref` callback closing over the loop index at the top-level plain-loop call site wasn't wrapped into a live accessor call, unlike its branch-loop counterpart.

A reactive expression whose ENTIRE dependency is the loop's own index (no item, no signal — e.g. bare `{i}` or `class={i % 2 === 0 ? 'a' : 'b'}`) is unaffected by this change: it still isn't classified as reactive at all in either the eager or lazy path, a separate pre-existing gap tracked in #2861.
