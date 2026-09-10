---
"@barefootjs/go-template": patch
---

The Go template adapter now delivers a dynamic (non-bakeable) named jsx-children prop into a child component's rest bag — a prop the child only reads via its `{ ...rest }` binding rather than a declared param (e.g. `function Card({ children, ...rest }) { ... rest.header ... }`) — instead of refusing with a loud BF101. A new runtime helper (`WithBagEntry`/`bf_with_bag`, `runtime/bf.go`) sets one entry in the rest bag's `map[string]any` field on a per-call-site copy of the child's props, mirroring `WithProps`/`bf_with_props`'s existing per-declared-field delivery. The rest-bag field is also now emitted on both the child's Input and Props structs whenever the component destructures a rest binding at all, not only when it's also spread onto an element — a prerequisite gap the static bake path had too (#2805).
