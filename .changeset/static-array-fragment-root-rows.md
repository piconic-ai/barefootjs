---
"@barefootjs/jsx": patch
"@barefootjs/client": patch
---

Client JS: rows of a static (module-const) array whose row component has a fragment root are now initialised after hydration and after a CSR mount, so their handlers attach. The row init looked rows up with an element attribute selector, which cannot match the `<!--bf-scope:-->` comment that scopes a fragment-rooted row. It now finds rows by slot through the new runtime helpers `childScopesBySlot` / `childScopeBySlot`, which match both forms. The same applies to a fragment-rooted component nested in a static array's element row or inner loop.
