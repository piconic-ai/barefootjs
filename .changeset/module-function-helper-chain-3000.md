---
"@barefootjs/jsx": patch
---

Fix a module-top-level `function` helper that calls another module-top-level helper (a "helper chain") silently emitting an empty CSR template seed (`${''}`) instead of being referenced by name — `computeInlinability`'s function loop now shares the same module/init scope fixpoint `compute-scope.ts` already used for emission placement, instead of an independent, overly conservative check.
