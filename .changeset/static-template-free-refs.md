---
"@barefootjs/jsx": patch
---

A component's CSR `template:` lambda no longer emits a bare signal or memo read when the expression starts with a prop (`{label + count()}`). Whether the lambda can be built from the expressions as written is now decided from the IR's free identifiers instead of the expression text.
