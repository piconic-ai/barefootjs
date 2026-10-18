---
"@barefootjs/go-template": patch
---

A signal seeded by a call or a member read over a prop (`(props.label ?? 'x').toUpperCase()`, `(props.label ?? '').length`, `Math.max(props.n ?? 0, 1)`, `[props.n ?? 0].length`) now starts at the expression's value: it is seeded by the runtime evaluator. Before, the first seeded the bare prop and the rest seeded their type's zero value. A prop seed outside the evaluator's subset now fails with BF101 instead of baking a zero value, and an optional prop read under `??` in an evaluated seed reaches the evaluator as `nil` when absent, so the `??` default applies.
