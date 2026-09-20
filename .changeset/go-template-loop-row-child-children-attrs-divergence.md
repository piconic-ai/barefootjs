---
"@barefootjs/go-template": patch
---

Declare the `loop-row-child-children-attrs-frozen` render divergence for `@barefootjs/go-template`: a `.map()` loop row whose call to a child component forwards a JSX element as `children` renders SSR with the whole loop silently missing when the loop's source array is a function-body-local `const` — `NewXxxProps`'s constructor never populates the generated loop-array slice field for that shape. No lowering change yet; the fixture is skipped in `go-template-adapter.test.ts`'s conformance suite via the divergence declaration.
