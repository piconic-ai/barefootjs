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

A server-rendered loop row whose binding is named `props` now reads its own members. In `rows.map((props) => <li>{props.label}</li>)`, the Blade, erb, Jinja, MiniJinja, Mojolicious, Pebble, Twig and Xslate templates read `props.label` as the component's prop `label`, which is empty when the component has no such prop. The same happened for a destructured `({ props }) => …` field and a row-local `const props`, and, on erb, Mojolicious and Xslate, for a `.filter((props) => …)` predicate. On a component that takes its props as one object named `props`, the Go template did the same. On every one of these adapters, a row's optional member read as an attribute (`data-tone={props.tone}`) on such a component was also dropped whenever the component's own prop of that name was absent. A `props.<name>` read under such a binding also no longer takes the string typing of the component prop of that name, so `props.n + 1` adds a row's number where it used to concatenate it as a string (Go and the template adapters above). A `props` that no binding shadows still reads the component's props. Every fixture whose source has no such binding renders as before.
