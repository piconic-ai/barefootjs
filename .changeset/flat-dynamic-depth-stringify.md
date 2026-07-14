---
"@barefootjs/go-template": patch
"@barefootjs/erb": patch
---

Fix #2262: `.flat(dynamicDepth)` with a runtime depth of `0` or negative now matches the documented `ToIntegerOrInfinity` contract (shallow copy, not empty) end-to-end on Go and ERB. The depth coercion itself (`coerceFlatDepth` / `coerce_flat_depth`) was already correct — the bug was in stringifying the unflattened nested-array elements afterwards (e.g. `rows.flat(0).join(' ')`):

- Go: `toString` (used by `Join`/`ConcatStr`) returned `""` for any non-primitive value, including a nested-array element left in place by a no-op flatten — now it recursively comma-joins array elements, mirroring JS's `Array.prototype.toString` (`this.join(',')`).
- ERB: the shared `string` helper fell through to Ruby's `Array#to_s` (`"[[1], [2]]"`, inspect-style) for array values — now it recursively comma-joins the same way.

Removes the `array-flat-dynamic-depth:gen:depth:zero` / `:gen:depth:negative` `skipDataPoints` pins on both adapters.
