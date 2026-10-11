---
'@barefootjs/jsx': patch
---

A delegated loop-row event now reaches its handler when the row item is falsy (`0`, `''`, `false`). The compiled lookup guarded the handler on the item's truthiness; it now tests for a missed lookup (`undefined`) only.
