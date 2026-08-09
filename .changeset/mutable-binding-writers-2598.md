---
'@barefootjs/jsx': patch
---

Keep the declarations that WRITE a mutable binding when that binding survives into an emitted SSR template (#2598). Reachability is seeded from the rendered JSX, which has already had client-only attributes stripped, so a handler reachable only through `ref={setRef}` (or `onClick={handleClick}`) is pruned — deliberate, since it is client-only. The hole was a `let` that outlives its writer: it survives because another surviving declaration reads it, leaving the template to declare and read a binding it never assigns, which TypeScript narrows to `never` at every guarded use (TS2339). `findReachableNames` now closes over writers of surviving mutable bindings, detected via the TS AST so a read, a comparison, or a property write through the binding does not count.
