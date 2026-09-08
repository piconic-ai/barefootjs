---
"@barefootjs/jsx": patch
---

Fix #2798: a static (non-signal) array's nested `.map()` over PLAIN ELEMENTS (not child components) inside a static outer row wired up nothing at all — no `ref` invocation, no reactive text or attribute effect — even though the outer row's own bindings, and a depth-N CHILD COMPONENT inner loop, were already faithfully wired. `buildStaticArrayChildInitsPlan`'s `elem.innerLoops` pass only ever ran for a matching nested child component (`innerComps.length === 0` skipped the loop entirely), so a plain-element inner loop's row stayed frozen at its SSR-baked value. The same `inner-loop-nested` double-`forEach` shape now also wires the inner loop's own reactive attrs/texts/refs, scoped to depth-1 nesting under a plain-element-rooted outer item (deeper nesting remains a documented known limitation — `NestedLoop` has no parent link to thread a second offset through).
