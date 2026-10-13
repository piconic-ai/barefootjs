---
'@barefootjs/jsx': patch
---

Only treat an optional `boolean` prop as always-boolean when its destructure default is itself proven boolean, so `{ on = undefined }` keeps rendering `undefined` (not `false`) on the Perl adapters when stringified.
