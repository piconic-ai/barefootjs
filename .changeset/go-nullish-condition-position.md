---
"@barefootjs/go-template": patch
---

Fix #2254: Go's `??` nullish gate now applies in **condition position** (ternary tests / `{{if}}` paths, reached via `convertConditionToGo`), not just plain expression-interpolation positions.

`renderConditionExpr`'s `logical` case unconditionally emitted Go's truthiness-based `or` for both `&&` and `??`, so a nillable-lowered optional prop's present-but-empty value (`''`/`0`/`false`) wrongly fell back to the `??` default when tested in a condition — e.g. `(props.label ?? 'Default') === 'Default' ? <A/> : <B/>` rendered `<A/>` for `label=""`, diverging from JS (which keeps `''` since it's present, not nullish). The sibling `logical()` emitter (used for other expression positions) already routed nillable operands through the nil-testing `bf_nullish` helper since #2248/#2252; this brings the condition-position emitter in line with it via the same `nillablePropNameOf` gate.
