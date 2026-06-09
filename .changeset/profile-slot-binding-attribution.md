---
"@barefootjs/jsx": patch
---

fix(profile): attribute prop-derived-const bindings forwarded into child components (#1863)

`bf debug profile button --scenario auto` (and `badge`/`avatar`/`kbd`) surfaced
`Button#binding:s0`/`s1` as `(unresolved)` hot rows plus a coverage warning, even
though those `createEffect`s have a real source location.

Root cause: the binding reads a prop *indirectly* through a local const —
`const classes = `…${variant}…${className}``, then `<button class={classes}>` /
`<Slot className={classes}>`. The emitter inlines `classes`, sees the prop reads,
and wraps both in a `createEffect` emitting `#binding:<slot>`; but the analyzer's
prop check only inspected direct references, so the expression's lone free
identifier `classes` matched nothing and the id never made it into `buildIdIndex`.

`buildGraphFromIR` now precomputes the local consts whose value transitively
derives from a prop and treats reading one as reading a prop. The `component`
case of `collectDomBindings` also switches from the naive `includes('props.')`
check to the shared prop predicate, so a prop (or prop-derived const) forwarded
into a child component (`<Slot className={classes}>`) is tracked too. Both
`#binding:<slot>` ids now resolve to their JSX source line in the hot table
instead of `(unresolved)`.
