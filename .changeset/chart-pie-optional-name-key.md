---
"@barefootjs/chart": patch
---

`buildPieSlices` accepts an absent `nameKey`, matching the optional `<Pie nameKey>` prop that passes it through. Without one, every slice stays unnamed, as before.
