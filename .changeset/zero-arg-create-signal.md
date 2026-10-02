---
"@barefootjs/jsx": patch
---

A `createSignal()` call with no initial value now compiles to valid client JS. In profile mode, the signal's id used to follow a bare comma (`createSignal(, "Comp#signal:v")`). It is now preceded by `undefined`. Reading such a signal in JSX made the CSR template inline `()` in place of its value, which broke the module even without profiling. The template now inlines `undefined`. `CLIENT_EXPORTS` is now exported, so a test can pin the compiler's list of recognised `@barefootjs/client` imports against the package's real exports.
