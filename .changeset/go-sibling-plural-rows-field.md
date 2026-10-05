---
"@barefootjs/go-template": patch
---

A component loop whose child's plural is the Go field name of a different array prop no longer takes that prop's field. Next to `props.items.map(row => <Badge …>…</Badge>)`, a sibling `props.other.map(row => <Item … />)` named its rows field `Items` — the `items` prop's own field — so the `items` loop rendered empty (or the generated Go failed to build), and the `items` hydration prop was overwritten with the `<Item>` rows. A loop's rows field is now `<Child>Rows` (`ItemRows`) when a different prop already owns the plural; a loop over the very prop that owns its plural (`tags.map(t => <Tag …/>)`) keeps it. Go code that set such a loop's caller-supplied rows field directly sets `<Child>Rows` instead.
