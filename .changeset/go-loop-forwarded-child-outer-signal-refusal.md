---
"@barefootjs/go-template": patch
---

A static `.map()` loop row that calls a child component, forwarding JSX `children` that read an OUTER signal or memo (not just the row's own item), now refuses with `BF101` at build time. It used to compile clean and silently drop the whole loop from SSR, because the row's forwarded children render through a per-row companion template (`bf_tmpl`/`ExecuteTemplate`) with no path back to the parent component's own state. The same refusal covers a scalar-item row (`['a', 'b'].map(...)`) whose forwarded children nest a component. Mark the loop `/* @client */`, or pass the outer value into the loop-body component as its own prop.
