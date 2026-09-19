---
"@barefootjs/jsx": patch
---

The child-root prop mirror's boolean-IDL branch (`open`, `checked`, `disabled`, `hidden`, `selected`, `required`, `readonly`, `multiple`, …) now seed-gates on `hasAttribute` the same way the `presenceOrUndefined`/generic branches already do, instead of writing `target.open = …` unconditionally. A prop named after a native boolean attribute (e.g. `open`, matching `<details>`/`<dialog>`) but passed to a child component whose own root is an ordinary element no longer gets a live DOM property planted on it after hydration that SSR never had — the case `#2716`'s fix covered for `value` but missed for this branch.
