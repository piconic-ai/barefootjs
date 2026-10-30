---
"@barefootjs/jsx": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
"@barefootjs/go-template": patch
---

Template adapters: a `+` whose string operand is typed only by its binding is now string concatenation, as in JS. A loop row field declared `string` (`rows.map((r, i) => r.id + i)`, a nested field, a destructured `({ id }) => id + n`, an element of a nested `string[]` loop) is typed from the row's declared element type, so `r.id + r.n` renders `a1` instead of `1`, `0`, or a render-time type error. A string prop keeps its typing when a loop param or `.filter()` predicate param elsewhere in the component reuses its name: `props.label + 1` renders `L1`, while the numeric param inside the loop still adds. String typing is decided at the read through the shared `BindingScope` on every adapter.
