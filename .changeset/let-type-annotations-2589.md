---
'@barefootjs/jsx': patch
---

Preserve explicit `let` type annotations in emitted `.tsx` templates (function scope and module scope), fixing TS7034/TS7005/TS2339-on-`never` under strict (#2589).
