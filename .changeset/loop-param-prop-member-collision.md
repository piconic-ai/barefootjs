---
"@barefootjs/jsx": patch
"@barefootjs/blade": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

An explicit `props.value` read inside a `.map()` row whose callback binds the same name (`props.values.map(value => … props.value …)`) now reads the root prop on the Blade, Jinja, MiniJinja, Mojolicious, Pebble, Twig and Xslate adapters, as Hono does. These adapters flatten `props.X` to the bare template variable `X`, which the loop variable shadowed for the whole row. A loop that shadows a prop now assigns it to a root alias just before the loop (block-scoped on Mojolicious/Xslate), and `props.X` inside the row reads the alias. The shared helpers `rootPropAliasesForLoop` / `rootPropReadName` in `@barefootjs/jsx` decide which names need an alias.
