---
"@barefootjs/go-template": patch
---

A signal seeded through a member chain of a prop, at any depth (`createSignal(initial.label)`, `createSignal(initial.address.city)`, `createSignal(props.initial.items)`), now refuses to compile with `BF101` instead of silently baking a `nil` seed — text reads used to render empty, a conditional took its falsy branch, a loop rendered no rows, and forwarding the value to a child's typed prop made the generated Go fail to build, all with no diagnostic. Pass the value as its own top-level prop instead of reading it through another prop. Hono and the other eight DSL adapters already rendered this shape correctly and are unaffected.
