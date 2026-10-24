---
"@barefootjs/go-template": patch
---

Declare the render divergence of a component loop row over an array prop keyed by a computed expression of the row or index (`key={x.toString()}`, `key={i.toString()}`), whose rows render without `data-key`, against the `component-row-computed-key-dropped` limitation.
