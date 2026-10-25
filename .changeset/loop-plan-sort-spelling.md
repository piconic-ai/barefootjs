---
"@barefootjs/jsx": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

The loop source's sort is now planned and spelled in one place. `planLoop` lowers a `.map()` loop's comparator with the new `lowerSortComparator`, which also handles `.sort(cmp)` at an expression position. It types the result as `SortPlan`: the evaluator call, the structured `{keys: …}` descriptor, or BF101. The new `spellSortedSource` dispatches over that plan. Each DSL adapter's `renderLoop` now only passes its spelling: the env emit, the evaluator call, the `bf.sort` call and the BF101 record. ERB and Mojolicious spell their hoisted sort in the outer scope through `renderInScope`. Templates and diagnostics are unchanged.
