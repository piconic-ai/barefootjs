---
"@barefootjs/jsx": patch
---

Recognize `children` spliced through a renamed destructure, so it gets the
same nullish guard as the two spellings #2775 already covered.

`const { children: kids } = props` followed by `{kids}` still rendered the
literal text `undefined` on a pure-CSR mount when the caller passed no
children, while SSR and SSR+hydration rendered nothing.

`isChildrenPassthroughExpr` tested only `node.expr`, the pre-substitution
source text, which reads `kids` for this shape and matches nothing. The
compiler had already resolved the alias by then — the expression the emitter
was about to splice read `(_p.children)` — so the information needed was
present at the decision point and simply unused. `bareSpliceExpr` now tests
the resolved expression as well as the source text. `node.expr` stays the
primary test because it is the one form that does not vary between the four
template builders.
