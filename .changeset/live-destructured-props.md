---
"@barefootjs/jsx": patch
---

A destructured `"use client"` prop (`function Foo({ count })`) now reads live, matching the reactivity that props-object mode (`function Foo(props)` + `props.count`) already had. Previously the destructuring pattern captured the prop's value once at mount and never saw later updates from the parent — a silent divergence between two syntactically equivalent ways of declaring the same prop, not a documented restriction. The compiler now rewrites every bare value-position read of a destructured prop name in the emitted init body to a live `_p.<key>` read via a shared binding-scope-aware walk (`rewriteDestructuredPropReads`), so `items.map((title) => title.a)` and a handler-local `const title = 'local'` still shadow correctly even when `title` is also a prop name.
