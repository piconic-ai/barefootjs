---
'@barefootjs/go-template': patch
---

A `number` field of a named object type that a signal seed gives a fractional literal (`createSignal<User>({ age: 2.5 })`, an array element's `price: 1.25`) is now typed `float64`, so the generated constructor compiles and renders `2.5`. The field defaulted to `int`; integer-only fields keep it.
