---
"@barefootjs/jsx": patch
---

Fix #2865: a nested `.map()` — one lexically inside an outer `.map()`'s JSX body, under a dynamic (composite) outer loop — used to be classified "reactive" or "static" purely by checking whether its array textually referenced the outer loop's item. Anything else the inner array (or a text/attr/conditional inside its rows) depended on — a component signal, a memo, a prop, an imported function call, a `.map()`-callback preamble local, a destructured outer param, an outer-index-derived array — fell through to a hydration-only `forEach` that never wired a single `createEffect` and never re-ran, silently freezing that content forever after the initial render. A destructured outer param made it worse: the static path skipped the destructure-unwrap statement entirely, so the emitted `forEach` could reference a bare identifier that was never declared in scope.

Every nested loop now gets the full reactive `mapArray` emission unconditionally — the same fix already applied to the analogous inner-loop-inside-a-conditional-branch path. A `mapArray` over a genuinely non-reactive array simply subscribes to nothing and runs once, a strict superset of what the deleted static path did, so this costs nothing for the truly-static case while fixing every shape that was silently frozen before.
