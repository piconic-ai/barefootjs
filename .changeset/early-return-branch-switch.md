---
"@barefootjs/jsx": patch
---

Signal-conditioned early returns lower to the root-ternary branch-switch plan (#2463)

`if (loading()) return <A/>; return <B/>` is semantically the root ternary
`return loading() ? <A/> : <B/>`, and the `IRIfStatement` contract in
`spec/compiler.md` says the client JS handles all branches and switches at
runtime. Before this fix the statement form emitted no branch-switch effect —
the setter fired and nothing subscribed, so the UI could never leave the
SSR-rendered branch — and the CSR `template:` lambda referenced the
init-scoped signal (a `ReferenceError` on CSR mount; the last non-#2075
entry in the adapter-tests scope-gate ledger).

A conditional-return chain whose conditions all CALL signal/memo getters and
that declares no branch-local scope variables is now built as the same
`IRConditional` chain the root ternary produces, wrapped in the synthetic
`display:contents` scope element — so the `insert()` plan, per-branch
templates/event bindings, and template-scope signal substitution all apply
unchanged, and the runtime branch-swap behavior is the ternary machinery
that existing coverage already exercises.

Deliberately narrow: prop-conditioned or static chains, and chains with
branch-local declarations (`#1409`/`#1414` machinery), stay on the
IRIfStatement path byte-for-byte. The `signal-early-return` fixture
graduates from the scope-gate ledger and its `expectedHtml` is regenerated
to the wrapper form.
