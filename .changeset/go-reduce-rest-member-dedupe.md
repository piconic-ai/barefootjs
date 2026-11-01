---
"@barefootjs/go-template": patch
---

Go templates fix three value gaps (#3843):

- A memo over `.reduce(...)` / `.reduceRight(...)` is seeded with its value on SSR instead of `0`, and a memo over `.map(...)` used as a loop source renders its rows instead of an empty loop. Evaluated arrays now convert into slice fields through the new runtime helper `bf.ToSlice`.
- A condition on a rest member (`rest.tone ? … : …`) reads the rest bag like a plain `{rest.tone}` does, instead of always taking the false branch.
- `{...rest}` together with an explicit prop of the same key no longer emits a duplicate struct field (a Go build error); the final writer wins, as in JS.
