---
"@barefootjs/go-template": patch
---

A child component prop computed from a component-scope const (`const shown = props.label ?? 'd'` then `<Badge text={shown} />`) is now seeded on Go through the const's value. A const that shadows the prop no longer reads the bare prop and drops its default.
