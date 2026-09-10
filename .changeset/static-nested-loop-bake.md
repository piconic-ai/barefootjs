---
"@barefootjs/go-template": patch
---

The Go template adapter's static-array per-item unroll (`analyzeBakeableStaticElementLoop`, #2224) no longer refuses a `.map()` row that contains a nested `.map()` over a per-item array (e.g. `item.children.map(child => ...)`). The analysis now recurses into a nested static loop, accumulating each level's item binding so arbitrarily deep static nesting bakes — previously this shape fell through to a generic BF101 "computed loop array" refusal (#2893).
