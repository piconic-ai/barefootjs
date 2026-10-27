---
"@barefootjs/go-template": patch
---

Escape the literal segments of a template literal (outer and nested) where they land in markup outside a `{{…}}` action. A `"` in an attribute template literal such as `` className={`content-["x"] ${`a-["y"] ${tag}`} z`} `` no longer closes the attribute and fails the render, and a `<` in a text-position template literal no longer emits a tag.
