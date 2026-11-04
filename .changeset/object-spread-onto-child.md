---
"@barefootjs/jsx": patch
"@barefootjs/client": patch
"@barefootjs/go-template": patch
---

A spread of an object other than the component's own props onto a child component (`<Chip {...row} />`, a loop row's `{...r}`) no longer drops its keys:

- Client JS: the spread merges with the call's explicit props in source order, in the CSR template (`renderChild`) and in the child's init. Init merges through the new runtime helper `spreadChildProps`, which resolves every read against the parts that have the key now, from the last part to the first, so a later value of the object reaches the child: a key it gains overrides an earlier explicit prop, and a key it drops brings that prop back. Nothing is evaluated until a read, so a spread in a branch the component did not take (the UI `Slot`'s `{...children.props}` with no `children` at hydration) is never evaluated. A child whose spread reads a value only init can see is rendered by init, as an explicit prop is.
- A `{...props}` or `{...rest}` spread on the same call merges in source order with it: `<Tag {...childProps} {...props} />` lets the caller's keys win over the object's.
- A `const` alias of a closed-type rest (`const a = rest`, through any number of hops) is the rest itself: its spread unrolls per key like `{...rest}`, so the keys the component destructured are not forwarded.
- Go: the child's input is built one field per key at compile time, so an object spread onto a child component is refused with BF101 instead of rendering the child empty.
