---
'@barefootjs/go-template': patch
---

A `number` field of a named object type that a signal seed gives a fractional literal (`createSignal<User>({ age: 2.5 })`, an array element's `price: 1.25`) is now typed `float64`, so the generated constructor compiles and renders `2.5`. The field defaulted to `int`; integer-only fields keep it. A `number` memo computed by the runtime evaluator over such a field (`u().age! * 3`) now keeps its fraction (`7.5`) instead of truncating into an `int` field; a memo whose body is structurally an integer (a `.length` read) stays `int`.
