---
"@barefootjs/jsx": patch
---

A component-scope const read inside a loop row now reads the const in the client JS when the row binds a name its initializer reads (`const b = a` read as `{b}` in `rows.map(a => …)`). The client row code spliced the initializer (`a`) into the row, where it read the row value, so a hydrated, client-built or updated row showed the row value instead of the const.
