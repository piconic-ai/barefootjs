---
"@barefootjs/jsx": patch
---

A literal or bare boolean attribute followed by an open spread of the same key (`<p title="a" {...rest}>`, `<annotation-xml encoding="application/x-tex" {...rest}>`) now renders the key once on the template adapters, with the spread's value, as Hono and JS do. Phase 1 sets `IRAttribute.spreadOverridable` on the attribute: its own value when every later spread (a rest, the props object, a signal or memo getter, a loop row) lacks the key, and no attribute otherwise. `renderElementAttributes` renders that form for every template adapter, so the key no longer appears twice (a browser keeps the first). A key the rest destructure took, a spread that is a local `const` or a conditional object, and attributes with an expression value are unchanged; the remaining overlapping-key shapes are registered as the `attr-spread-key-overlap` limitation.
