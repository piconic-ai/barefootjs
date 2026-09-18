---
"@barefootjs/go-template": patch
---

Register a new go-template limitation in the known-limitation registry, with a reproducing conformance fixture: `nested-prop-object-array-child-component-go` — a `.map()` over a nested array on a destructured object-shaped prop (`data.entries.map(entry => <Tag .../>)`), whose body is a child component, renders with no rows on real Go SSR (compiles and runs clean everywhere; only Go's output is empty). Root cause: the field is typed `interface{}` in the generated Input/Props structs instead of its own generated struct type, so the existing prop-derived child-slice auto-population (`NewXxxProps`) has no typed field to read the array off. Declared as a render divergence, citing the new registry entry.
