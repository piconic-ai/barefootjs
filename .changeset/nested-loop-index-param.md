---
"@barefootjs/jsx": patch
---

Fix #2218: a nested (inner) `.map()` callback that declares a positional index parameter and references it — as `key={i}`, in a reactive text/attribute expression, in a template interpolation, in a `.map()` block-body preamble local, or in an event handler / ref callback / child-component prop — no longer throws `ReferenceError: i is not defined` in the generated client JS (which previously left the inner loop rendering nothing on the client).

`NestedLoop` now carries the IR loop's `index` param (mirroring `TopLevelLoop` / `BranchLoop`), `loopKeyFn` threads it into the `mapArray` keyFn signature (`(item, i) => String(i)`), and the renderItem / `forEach` body binds the user's index name to the synthetic positional index (`const i = __innerIdx<uid>`) as the first prelude statement — on both the composite inner-loop path and the conditional-branch-arm path (`loop → conditional → inner loop`). Sibling of the #2189 fix, which covered the same class of bug for delegated event handlers only.

The alias is gated by an AST-based free-identifier scan across every surface the body can read the index from (key, reactive texts/attrs, map preamble, item template interpolations, events, refs, component props), so a declared-but-unreferenced index emits no alias binding. Note that the keyFn signature itself now includes the index param whenever the callback declares one — matching how top-level and branch loops have always emitted it — so nested loops that declare an index see that (behavior-neutral) signature change even when the key doesn't reference it; loops without an index param keep byte-for-byte identical output.
