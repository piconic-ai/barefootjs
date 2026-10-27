---
"@barefootjs/jsx": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
"@barefootjs/go-template": patch
---

A component-scope const read inside a loop row or callback that binds a name the const resolves through now renders the value it holds on the server. In `const a = children; const b = a` read as `{b}` in `rows.map(a => …)`, or `const c = label` read in `rows.map(label => …)`, the Blade, erb, Jinja, MiniJinja, Mojolicious, Pebble, Twig, Xslate and Go templates rendered nothing (or failed to render on Go), because they read the const as a template variable that is never set. The const's initializer now resolves in the component scope: an intermediate const is replaced by its own initializer, and a destructured prop the row shadows is read through the component's props, with its destructure default. A const that reads a signal getter the row shadows (`const b = count()` read in `rows.map(count => …)`) still renders nothing and stays a tracked limitation.
