---
"@barefootjs/go-template": patch
---

Give each child-component loop site its own rows field. Two loops whose row is the same component (`<Chip>`) no longer share one `Chips` slice, so the second loop renders its own rows from `ChipRows` instead of the first loop's rows. A loop whose row forwards children over a prop named like the row's plural (`props.groups.map(g => <Group key={g}>…</Group>)`) now keeps the prop's own `Groups []string` field and builds its rows into `GroupRows`. Before, the rows field took over `Groups` as caller-supplied `[]GroupInput`, so the prop had no Go field and the component failed to build with its real data. A bodyless row over such a prop keeps the existing caller-supplied rows field.
