---
'@barefootjs/jsx': patch
---

Fix a `.map()` loop-body conditional whose condition bare-references a preamble-declared local (a pre-return `const` in the callback body) never re-evaluating when that local reads a signal/memo/reactive prop. Phase 1 now derives the condition's reactivity from the preamble local's own dependency set (`computePreambleReactiveNames`, transitive through earlier preamble declarations) and grants it the same `reactive` flag + slot id ordinary conditions get; Phase 2's `collectLoopChildConditionals`/`emitOuterConditional` got the `readsPreamble` bypass + preamble-re-run-in-getter treatment reactive attributes already had (#2447), the condition-position twin. A conditional whose preamble local is purely item-derived (no signal/memo/prop read) stays non-reactive, as before.

Closes #2596
