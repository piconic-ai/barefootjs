---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

A raw `props.label` read beside a signal or memo derived from that same prop (`const [label] = createSignal(props.label ?? 'D')`) now renders the caller's value on the template adapters, empty when the caller omits it. They used to render the signal's value there (`D`). When the component reads the raw prop anywhere outside the binding's own initializer, including through a component-scope const, the compiler now separates the binding from the prop before building IR, as it already did for a binding seeded from another prop. An untyped `props` parameter takes the same rule, with its `props.<name>` reads naming its props. A self-derived binding whose prop is read nowhere else keeps its name.

Go: a number signal seeded through a component-scope const of an optional prop (`const mid = props.b; createSignal((mid ?? 1) * 2)`) now takes the `??` fallback when the caller omits the prop, instead of reading it as `0`.
