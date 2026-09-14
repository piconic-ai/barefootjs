---
"@barefootjs/jsx": patch
---

Fixes #2986: a `'use client'` component calling a plain helper declared at module top level as `const name = (params) => { ... }` (arrow form) could crash two ways — a sync helper's inner declarations leaked into the component's init function with their parameter references unbound (`ReferenceError` at mount), and an async helper's inner `await` leaked into a non-async scope (esbuild parse failure at build time). The `function name(params) { ... }` declaration form was unaffected.

Root cause: `analyzer.ts`'s module-level `visit()` walk descended into the body of a module-level arrow-valued `const`, collecting that body's own inner `const`/`function` declarations as if they were declarations of the file itself. `visitComponentBody` already had the guard that prevents exactly this; `visit` never did. Both walks now share one `isFunctionScope` predicate deciding when a nested declaration collector must stop.
