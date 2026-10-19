---
"@barefootjs/go-template": patch
---

A signal seeded by a call or a member read over a prop (`(props.label ?? 'x').toUpperCase()`, `(props.label ?? '').length`, `Math.max(props.n ?? 0, 1)`, `[props.n ?? 0].length`) now starts at the expression's value: it is seeded by the runtime evaluator. Before, the first seeded the bare prop and the rest seeded their type's zero value. An optional prop read under `??` in an evaluated seed reaches the evaluator as `nil` when absent, so the `??` default applies; a destructured prop reaches it with its destructure default rather than a sibling signal's fallback. A fractional evaluated seed forwarded to a child's number prop widens the child's field to `float64`.
