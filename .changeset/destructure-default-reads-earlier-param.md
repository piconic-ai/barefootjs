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

A props destructure default that reads an earlier binding of the same pattern (`{ off = false, on = off }`, `{ a = 'x', b = a, c = b }`, `{ off = false, on = !off }`, or the body form `const { off = false, on = off } = props`) now gives an omitted prop the value it has in JS. The client JS reads the earlier prop live (`_p.on ?? (_p.off ?? false)`) instead of naming an undeclared `off`, the template adapters re-bind the prop in-template from the earlier prop's variable through a new `origin: 'prop'` step of the SSR seed plan, and Go makes such a prop's field nillable and evaluates the default in the constructor when the prop is absent. Before, the server rendered the omitted prop empty (or its zero value) and the client JS threw a `ReferenceError` when it read the omitted prop.
