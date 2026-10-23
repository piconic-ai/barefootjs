---
"@barefootjs/go-template": patch
---

Render a loop row over a string, number or boolean array prop whose row component forwards children (`props.picks.map(g => <Tag key={g}><i>{g}</i></Tag>)`). The constructor now builds the wrapper rows from the prop with the row value on `BfLoopItem`, as it already did for a primitive-literal array; before, nothing filled them and the loop rendered no rows. A scalar row's forwarded children can now also read the loop index, and a prop of the row component can read the row value.
