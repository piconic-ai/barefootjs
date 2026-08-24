---
"@barefootjs/jsx": patch
---

Fix #2706: a per-item conditional living inside a NESTED (inner) `.map()`'s own row (`rows().map(row => <div>{row.items.map(item => cond ? <span/> : null)}</div>)`) used to be baked directly into the row's static HTML template — the condition evaluated exactly once, at row creation, and never revisited, even when it read a signal (a silent divergence, confirmed by experiment: an independent signal read by the condition kept flipping while the DOM stayed frozen). The reactive text nested in the true branch still assumed `insert()` kept the branch's marker mounted, so when a row was first created with the false branch active — the marker never rendered at all — its `claimSlots` effect warned `slot sN marker not found; skipping` / `no claimed slot for id sN; write ignored` on the very first run.

A NESTED loop's own row conditionals now get the same `insert()` parity a top-level loop's row conditionals already had: `collectInnerLoops` collects `bindings.conditionals` for every inner loop (branch-scoped or not), routes them through the existing `buildLoopChildConditionalsPlan`/`stringifyLoopChildConditionals` machinery the branch-arm path already used, and stops flattening a reactive conditional's own content into the old bake-and-reclaim path (`stopAtReactiveConditionals: true`) so the two mechanisms never double-bind the same text.
