---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

A `{...props}` spread onto a child component inside a `.map()` row (a component row, an element row, a conditional in a row, a static-array row, a nested loop's row) now reaches the row's child in the client JS, merged with the call's explicit props in source order as on a non-loop call. Each row builder spelled the spread as a getter named `...`, so on mount, row updates and hydration the child received none of the caller's keys. A loop row named `props` is no longer taken for the props object. On go-template, an explicit prop reading the row written after the spread (`<Tag {...props} label={it} />`) no longer builds a constructor literal with the field twice.
