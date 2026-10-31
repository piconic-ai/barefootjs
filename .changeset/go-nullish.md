---
"@barefootjs/go-template": patch
---

Go templates spell `??` from the shared primitive plan (#3824 step 7): only `null` and an omitted value fall through to the right operand, and `false`, `0`, `''` and `NaN` are kept, as in JS. Go's `or` tested truthiness and replaced every falsy left operand.

- A left operand the plan proves never nil (a comparison, a required scalar prop, arithmetic) is the result itself.
- Any other left operand is boxed by its nil test with the new runtime helper `bf_keep_nonnil` and picked with Go's short-circuiting `or`: `r` is evaluated only when `l` is nil, and each operand is rendered once, so a `??` chain grows linearly. This holds in attributes, text, `{{if}}` conditions, `.filter()` predicates, loop rows and child props.
- An optional prop read only inside a `??` chain (`a ?? b ?? c`) or as `?? null` now gets the nillable `interface{}` field, like any other `??` operand.
- A value Go stores as a concrete zero when JS sees it omitted (an optional prop typed by a named alias, an optional scalar field of a typed loop row, `searchParams().get(k)`) keeps `or`, which gives the fallback for the omitted value; a present `''` / `0` there still takes the fallback.
