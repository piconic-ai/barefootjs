---
"@barefootjs/go-template": patch
---

Render a loop row over a string, number or boolean array prop whose row component forwards children (`props.picks.map(g => <Tag key={g}><i>{g}</i></Tag>)`). The constructor now builds the wrapper rows from the prop with the row value on `BfLoopItem`, as it already did for a primitive-literal array; before, nothing filled them and the loop rendered no rows. On such a scalar row, every read of the row at the call site (a prop, a member such as `g.length`, a preamble local, a fused `.filter()` predicate, the range variable) now reads the value rather than the row wrapper, and forwarded children can read the loop index.
