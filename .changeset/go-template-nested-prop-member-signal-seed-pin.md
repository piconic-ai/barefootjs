---
"@barefootjs/go-template": patch
---

`renderDivergences` now declares two fixtures under the new `nested-prop-member-signal-seed` known limitation: a `createSignal` seeded from a member of an object-typed prop (`createSignal(initial.label)`) is baked as `nil` by the Go adapter, so its reads render the zero value, and forwarding it to a child's primitive-typed prop makes the generated `types.go` fail to compile. This records the gap in the compat report and conformance skip list; the adapter's output is unchanged.
