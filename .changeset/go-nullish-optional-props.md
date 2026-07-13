---
"@barefootjs/go-template": minor
---

Fix #2248: JS `??` on an optional scalar prop now carries real nullish semantics on Go. An optional `string`/`number`/`boolean` prop consumed by `??` (with a non-zero-equivalent fallback and no destructure default) lowers to the adapter's established nillable `interface{}` representation, so "absent" is distinguishable from an explicit `''`/`0`/`false` at render time:

- Template position: `{{bf_nullish .Label "Default"}}` (new runtime helper — falls back on nil only) replaces the truthiness-based `{{or …}}`, which collapsed a present-but-empty `""` into the fallback.
- Signal seeds (`createSignal(props.size ?? 1)`): the constructor hoist checks `if in.Size != nil` instead of `if size == 0`, so an explicit `Size: 0` input is honoured (JS `0 ?? 1` is `0`). Numeric props coerce through new exported `bf.ToInt` / `bf.ToFloat64` (an untyped `Size: 3` literal boxes as `int` even for a float64-shaped prop); string/bool assert directly.
- The flipped props join the existing nillable behaviours (bare-attribute omission on nil) by construction, and assignment ergonomics are unchanged — plain literals assign into `interface{}` fields.

Generated-code API note: for exactly these props the `XxxInput` / `XxxProps` struct fields change from a concrete scalar type to `interface{}`. Props with a destructure default (`{ className = '' }`) or a zero-equivalent fallback (`?? ''` / `?? 0` / `?? false`, where nullish and truthiness semantics coincide) keep their concrete types.

Found and verified by the data-point oracle conformance suite: the Go adapter's `skipDataPoints` entries for `nullish-coalescing-text` are removed, and all four adversarial points now match the JS reference render on real Go.
