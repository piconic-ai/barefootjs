---
"@barefootjs/jsx": patch
---

A stateless client component whose template reads a module const initialized by a module helper call (`const mk = () => ({ k: 'v' }); const B = mk()`, or `{ ...mk('v') }`, read as `{B.k}`) now declares that helper in its client module. The client template inlines the initializer, so it used to call an undeclared `mk` and a client mount threw a `ReferenceError`. Such a helper named like a runtime helper the client JS calls (`escapeText`) is refused with BF057, as it already was in a stateful component.
