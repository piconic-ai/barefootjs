---
'@barefootjs/test': patch
---

`renderToTest`'s `TestNode.classes` no longer leaks raw ternary operator tokens (`?`, `:`) and unresolved expression fragments for a bare `className={cond ? a : b}` expression (#2354). An inline ternary className (no backticks) is now walked structurally through the attribute's parsed tree — the `expression`-kind analogue of the existing `template`-kind `ternary` part handling — unioning both arms and resolving string literals, local-const / prop-default identifiers, and object-property member access. Object-literal constants with string-valued properties additionally seed member-path lookups (`rowClass.active` → `'row row-active'`), so the common per-item-styled list pattern (`className={item.active ? rowClass.active : rowClass.plain}`) resolves to `["row", "row-active", "row"]` instead of `["item.active", "?", "rowClass.active", ":", "rowClass.plain"]`. An unresolvable ternary now yields `[]` rather than the operator-token garbage.
