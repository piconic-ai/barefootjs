---
"@barefootjs/jsx": patch
---

CSR `template:` lambdas now declare the env-signal getters (`createSearchParams()`) they reference, fixing a `ReferenceError` at template evaluation.
