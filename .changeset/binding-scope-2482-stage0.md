---
'@barefootjs/jsx': patch
---

Add `BindingScope`, the shared scoped binding-resolution service for loop-callback-bound names (#2482 stage 0). New public export only — no existing code path is migrated yet; a shrink-only ratchet test pins the current inventory of the six legacy ad-hoc scope mechanisms it will replace.
