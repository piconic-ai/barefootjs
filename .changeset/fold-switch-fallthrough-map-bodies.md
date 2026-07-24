---
"@barefootjs/jsx": patch
---

Fold `switch` fallthrough in `.map()` bodies and harden the multi-return fold against silent drops (callback-body fidelity, Stage 2 of `spec/callback-fidelity.md`; follow-up to #2377).

- **Switch fallthrough:** an empty `case` label that falls through to the next clause's body (`case 'a': case 'b': return <b/>`) now folds — `extractMultiReturnJsxBranches` accumulates the fallthrough labels and the fold OR-joins them into `disc === 'a' || disc === 'b'`, so both `a` and `b` render the same element. Previously the empty fallthrough clause made extraction bail and the whole `switch` map body leaked verbatim.
- **No silent drops (fix, #2377 review):** a branch-local `const`/`let` (`if (c) { const x = …; return <A>{x}</A> }`, or a `switch` case with an extra statement) was accepted by the extractor but dropped by the fold, rendering the local `undefined` (ReferenceError at SSR/hydration). `isDirectReturnBlock` and the switch case validation now reject any non-return statement, so these shapes bail conservatively instead of folding-and-dropping.
- **Switch precedence (fix, #2377 review):** the generated `disc === case` condition now parenthesizes both operands (`(disc) === (case)`) so a low-precedence case (`case a ?? b:`, a ternary) keeps strict-equality semantics.
