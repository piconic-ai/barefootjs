---
'@barefootjs/go-template': patch
---

A child component's `number` prop that a caller in the same file passes a fractional value (a literal `value={2.25}`, a signal seeded with a fraction, an object signal's fractional field, a division, a loop row's fractional field) is now typed `float64`. It defaulted to `int`, so a literal failed `go run` and an evaluated value truncated (`2.5` rendered `2`). A prop that only receives integers keeps `int`.
