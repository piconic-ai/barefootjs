---
"@barefootjs/client": patch
"@barefootjs/jsx": patch
---

Remove dead runtime surface left by the slot unification: `getComponentProps`, `getPropsUpdateFn`, and `registerPropsUpdate` (consumer-less since `reconcileList`'s removal) are deleted from `@barefootjs/client/runtime`, and `tAfter` is dropped from the compiler's runtime-import candidates (no emission site remains). Documentation for the `/* @client */` directive is rewritten to describe the claimed-slot behavior that actually ships.
