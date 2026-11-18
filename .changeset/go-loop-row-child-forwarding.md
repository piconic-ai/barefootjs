---
"@barefootjs/go-template": patch
---

Go template: loop rows that hand content to a child component now render like the other adapters in four more shapes.

- A child-component loop inside another loop's row (`groups.map(g => <section>{g.tags.map(t => <Badge key={t} label={t} />)}</section>)`, or as the forwarded children of a component row) renders every outer row's own rows. It used to fail at render with `can't evaluate field Badges`, or render an empty inner loop. Each inner row has a scope and a `data-key` of its own. An inner row component that renders a child of its own and also collects a rest object is refused with BF101; marking the inner loop `/* @client */` renders it in the browser.
- The forwarded children of a component in a loop row can read what the row itself reads. For a component row (`<Chip key={o.id}>{props.pre}</Chip>`) that is a prop of the enclosing component, and, over a signal array, a signal or memo. For a component inside an element row it is also the row's index, a destructured row name, an enclosing row from a nested loop and another nested component. These used to fail at render (`can't evaluate field Pre`, `undefined variable "$__bf_item0"`, `can't evaluate field ChipSlotN`).
- A component row with forwarded children no longer hands the child a row field named like a prop the call omits (`opts.map(o => <Chip key={o.id}>…</Chip>)` over rows with a `tone` rendered the child's own optional `tone` as the row's).
- A signal seeded with an array literal, read whole into a static child's `string[]` / `number[]` / `boolean[]` prop (`<List items={items()} />`), directly or through an identity memo, builds. The generated Go passed a `[]interface{}` where the child's typed slice is expected.

The runtime gains `bf_row_scope` (`bf.RowScope`), which the generated templates call for the first shape, so update the Go runtime module together with the adapter.
