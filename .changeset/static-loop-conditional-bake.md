---
"@barefootjs/go-template": patch
---

The Go template adapter's static-array per-item unroll (`analyzeBakeableStaticElementLoop`, #2224) no longer refuses a `.map()` row that contains a conditional (`{cond ? <a/> : <b/>}`) alongside static siblings. A conditional whose branches are themselves foldable now bakes: an item-bound condition (e.g. `item.active ? ... : ...`) resolves to a per-item Go literal, and an item-independent condition (e.g. a signal call like `flag()`) falls through to the adapter's normal reactive lowering unchanged. Previously this shape fell through to a generic BF101 "computed loop array" refusal (#2898).
