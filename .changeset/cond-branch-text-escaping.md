---
"@barefootjs/jsx": patch
---

Escape text interpolated into a reactive conditional's branch template.

A conditional whose branch is TEXT put the value into the branch template
unescaped, so `{cond ? row.a : row.b}` with `row.a` of `A&<b>` inserted a real
`<b>` element into the DOM. The same expression wrapped in `String(...)` was
escaped, because that shape lowers to a text slot rather than a conditional.

The cause was one asymmetry repeated in all four template renderers'
`'expression'` case: the slotted form escapes, the un-slotted form did not. A
conditional BRANCH's inner text expression carries no `slotId` — the
conditional owns the id — so it always landed on the un-slotted path, and the
branch template becomes markup via `innerHTML` / `parseHTML`.

Both paths now make the same escaping decision. The cases that must stay raw
are unchanged: `joinArrayChild` still joins preamble-built HTML unescaped, and
`irToHtmlTemplate` keeps `branchSlotsVar` in the condition so `__bfSlot`
markers standing in for live `Node` values are not escaped and dropped.

Emitted templates change for any component with a text-branch conditional, so
committed goldens/snapshots covering that shape move with it.
