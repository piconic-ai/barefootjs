---
"@barefootjs/go-template": patch
---

Synthesise a Go struct for an untyped object-array signal so its inline initial value SSR-renders instead of staying `nil` (#1680). `createSignal([{ id: "a", n: 1 }])` now infers a struct from the literal's shape, types the signal field as a slice of it, and bakes the items — so the loop body's struct field access (`{{.ID}}`) resolves server-side. Synthesis bails to `nil` (prior behaviour) when elements don't share one shape, a value isn't a scalar literal, a key isn't a Go identifier, or the synthesised name would collide with an existing type. This also lets the `loop-item-conditional` conformance fixture render on Go.
