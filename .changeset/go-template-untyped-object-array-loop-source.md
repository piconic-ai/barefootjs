---
"@barefootjs/go-template": patch
---

A static `.map()` loop over an untyped module-scope object-literal array (`const opts = [{ id: 'a', label: 'A' }, ...]`, with no `Opt[]` annotation), whose rows call a child component with forwarded JSX `children`, now renders at SSR. It used to render an empty loop with no diagnostic. When every row is an object literal with the same keys, the adapter synthesizes a Go struct for the row shape, the same way it already does for an untyped object-array signal. When the rows don't share one shape (for example, a key present on only some rows), the loop now refuses with `BF101` instead of rendering empty.
