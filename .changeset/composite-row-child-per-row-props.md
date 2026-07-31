---
"@barefootjs/go-template": patch
---

Fix per-row props for a child component nested inside a composite dynamic loop row (#2445)

A child component nested inside a signal-driven `.map()` row whose root is a
plain element (`<li><Badge text={row.label}/></li>`) got ONE hoisted
`<Name>SlotN` props value, built once outside `{{range}}` — every row shared
the same instance, so a prop that read the row (`text={row.label}`) rendered
the same (always zero-value) content on every row instead of that row's own
value.

Fixed by reapplying a loop-dependent prop per row, at template-execution
time, via a new `bf_with_props` runtime helper — the props-argument sibling
of the existing `bf_with_children` helper, which already does this for
per-row JSX children on the same shared instance. A prop that doesn't depend
on the row is unaffected and stays on the constructor-only path. A per-row
prop shaped as a ternary or single interpolation (`row.on ? "yes" : "no"`)
is also supported; a prop that routes into the child's rest bag, or whose
expression is otherwise unsupported, safely stays on the constructor-only
path instead of emitting a broken pipeline argument.

The `composite-row-child-component` conformance fixture's render divergence
for this adapter is graduated (deleted from `render-divergences.ts`); the
sibling scope-id divergence tracked in #2444 (every other template-string
adapter) is unrelated and untouched.

Known follow-up (#2448): `bf_with_props` overrides the child's
already-constructed Props instance, so a field the child DERIVES from the
overridden prop (a memo, or a prop-shadowing signal's initial value) still
reflects the one-shot constructor's value, not the per-row one — only the
directly-overridden field itself is correct per row.
