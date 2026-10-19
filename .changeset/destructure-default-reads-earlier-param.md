---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

A props destructure default that reads an earlier binding of the same pattern (`{ off = false, on = off }`, `{ a = 'x', b = a, c = b }`, `{ off = false, on = !off }`, or the body form `const { off = false, on = off } = props`) now gives an omitted prop the value it has in JS. The client JS reads the earlier prop live (`_p.on ?? (_p.off ?? false)`) instead of naming an undeclared `off`, the template adapters re-bind the prop in-template from the earlier prop's variable through a new `origin: 'prop'` step of the SSR seed plan, and Go applies such a default to the props constructor's input before anything reads it (a renamed body binding that shares its prop with a raw `props.b` read computes it on its own instead, leaving the raw read and hydration with the caller's value) (a scalar prop's field becomes nillable for it, a slice already is), so a signal seed, a memo, a child prop or the props field reads the resolved value, a scalar one converted to its destination's type, and a passed value, an array included, is kept as passed; a default Go can't apply there is refused with BF101. The in-template re-binds follow the defaults' reads, not the props type's member order. The client-JS `template:` lambda now applies a destructure default where a signal seed or memo body reads the prop (`createSignal(tag)` with `{ tag = 'z' }` reads `_p.tag ?? 'z'`), as every other live read already did. Before, the server rendered the omitted prop empty (or its zero value) and the client JS threw a `ReferenceError` when it read the omitted prop.
