---
"@barefootjs/go-template": patch
---

A signal seeded from a member of an object-typed prop (`createSignal(initial.label)`, `createSignal(initial.items)`) now refuses to compile with `BF101` instead of silently baking a `nil` seed — text reads used to render empty, a conditional took its falsy branch, a loop rendered no rows, and forwarding the value to a child's typed prop made the generated Go fail to build, all with no diagnostic. Pass the member as its own top-level prop instead of nesting it inside an object prop. Hono and the other eight DSL adapters already rendered this shape correctly and are unaffected.
