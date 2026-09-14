---
"@barefootjs/jsx": patch
---

Fix a module-top-level `const name = (params) => expr` helper (arrow form) that closes over nothing but its own parameters silently emitting an empty CSR template seed (`${''}`) instead of being referenced by name — the equivalent `function name(params) { ... }` form already worked correctly.
