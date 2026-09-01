---
"@barefootjs/jsx": patch
---

Fix #2750: a `ref` callback's referenced `const`, when the element carrying `ref` sat inside a nested (depth-2+) `.map()` loop, had its call site emitted but its declaration dropped as dead code — a guaranteed `ReferenceError` at runtime. The Phase 3 reference-graph safety net now traces `ref` the same way it already traces `attrs`/`events` on every element, so a nested-loop ref's declaration is correctly kept alive.
