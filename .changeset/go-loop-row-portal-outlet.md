---
'@barefootjs/go-template': patch
---

A `ref`-callback portal element inside a loop row now renders at the `{{.Portals.Render}}` outlet with `bf-po` and its row key, matching the other adapters, instead of inline in its row. The element renders through a companion define (`bf_tmpl` + `bf_portal_scope`) that receives the row, the loop variables it reads and the root.
