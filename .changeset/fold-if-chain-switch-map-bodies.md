---
"@barefootjs/jsx": patch
---

Fold if/else-if chain and `switch` `.map()` callback bodies to neutral IR (callback-body fidelity, Stage 2 of `spec/callback-fidelity.md`).

A `.map()` whose callback body is a block with an if/else-if chain (or a `switch` with a `default`) returning a different element per branch now folds into a nested `IRConditional` — the same neutral IR a ternary map body already produces — instead of silently leaking: previously the leading `if (...) return <A/>` was emitted uncompiled into the map callback (a `ReferenceError` at hydration) while only the trailing `return <fallback/>` was templatized. All backends gain SSR fidelity for these shapes; no `/* @client */` is needed. The branch-fold core is shared with the multi-return JSX helper-function inliner. Preamble-const, switch-fallthrough, and statement-level nested-loop bodies are not yet folded and remain unchanged (follow-up).
