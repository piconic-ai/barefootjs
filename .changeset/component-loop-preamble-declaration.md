---
"@barefootjs/jsx": patch
---

Fix #2797: a loop-row preamble local (e.g. `const handleRowClick = () => {...}` declared inside a `.map()` callback) referenced only as a prop value on a child-component-per-row loop had its declaration dropped from the emitted module while the call site survived — a guaranteed `ReferenceError` at runtime. The `'component'` loop-plan variant now declares its preamble the same way the `'plain'` and `'composite'` variants already do, hoisted once before the hydration-reuse/fresh-row split so both branches read the same value.
