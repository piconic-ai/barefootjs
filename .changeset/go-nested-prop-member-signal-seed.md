---
"@barefootjs/go-template": minor
"@barefootjs/jsx": patch
---

A signal seeded from a member of an object-typed prop (`createSignal(initial.label)`, `createSignal(initial.items)`, `createSignal(props.initial.address.city)`) now renders its seed on go-template, matching Hono. Before, the Go adapter refused this shape with `BF101`. The constructor bakes the Input field path the member lives at (`Items: in.Initial.Items`), and the signal's own Props field takes that field's Go type (`Items []Item`), so the value reaches text, conditionals, keyed loops and child component props.

The prop's type must lower to a generated Go struct: an inline object type, or a same-file `interface` / `type X = { … }` object type. An optional object prop, an imported type, or a member of a non-object prop (`name.length`) still refuses with `BF101`, and the message now says which hop has no struct field. A prop member read inside a larger seed expression (`createSignal(initial.count + 1)`, `createSignal(initial?.label ?? 'none')`) now also refuses with `BF101`, even on a required prop. Before, Go silently baked the type's zero value there.

The analyzer now resolves a destructured prop typed by a same-file object type referenced by name (`{ initial }: { initial: State }`, `{ rows }: { rows: Item[] }`) the same way the `props`-object form already did. Before, it declined such a member to `unknown`. A generic, an `extends` clause, a non-property member, a union or function leaf, a recursive reference, or a name declared more than once (interface declaration merging) still declines.
