---
"@barefootjs/go-template": patch
---

A static `.map()` loop over an untyped module-scope object-literal array (`const opts = [{ id: 'a', label: 'A' }, ...]`, with no `Opt[]` annotation), whose rows call a child component with forwarded JSX `children`, now renders at SSR. It used to render an empty loop with no diagnostic. When every row is an object literal with the same keys and scalar fields, the adapter synthesizes a Go struct for the row shape, the same way it already does for an untyped object-array signal. Otherwise the loop now refuses with exactly one `BF101` instead of rendering empty: rows whose keys differ are reported as not sharing one shape, and a field the adapter can't type (a nested object, a non-identifier key) is reported as such. A row with a spread, a shorthand property or a function value keeps its existing "computed value" `BF101`.
