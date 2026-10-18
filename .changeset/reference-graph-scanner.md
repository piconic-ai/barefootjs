---
"@barefootjs/jsx": patch
---

The client JS keeps a `$`-named local (`step$`, `$`) that a handler reaches only through a helper. The reference graph found identifiers with a regex that ignored `$`, so the local was dropped and the handler threw `ReferenceError`.
