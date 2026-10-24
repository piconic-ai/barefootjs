---
"@barefootjs/jsx": patch
---

Lower a zero-arg `x.toString()` call in a template expression the same as `String(x)` on every template adapter. Before, the call fell to the getter fallback and rendered as a read of an `x.toString` property, so a loop row keyed by `x.toString()` rendered an empty `data-key` on element rows and none on component rows (Hono renders the stringified value). The same call in any other template expression went through the same property read. `n.toString(16)` and `x?.toString()` are unchanged.
