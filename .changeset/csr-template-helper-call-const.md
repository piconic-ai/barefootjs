---
"@barefootjs/jsx": patch
---

A const initialized by a call of a zero-param helper (`const B = mk()`) now renders on a client mount when the helper is not declared at module level, for example because it reads another module const (`const V = 'v'; const mk = () => ({ k: V })`). The client template splices the helper into the const as `(() => ({ k: ('v') }))()`, and the template-safety check refused that call, so `{B.k}` rendered empty, an attribute was dropped and a condition took the false branch. An applied zero-param, synchronous, expression-bodied arrow is now accepted exactly when its body is. A helper with parameters, a `function` declaration or an immediately invoked arrow that reads a module const still renders empty client-side; it is registered as `csr-template-module-declaration-reads-module-const`.
