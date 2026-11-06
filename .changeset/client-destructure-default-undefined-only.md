---
"@barefootjs/jsx": patch
---

Client JS now applies a prop's destructure default (`{ label = 'D' }`, and a body destructure of the props object) only when the prop is absent or `undefined`, as JS does: every live read, the CSR template, signal seeds and a written prop's local read `_p.label === undefined ? 'D' : _p.label` instead of `_p.label ?? 'D'`, so a `null` prop keeps `null` after hydration (empty text, no attribute) where it used to switch to the default. An author's own `props.x ?? d` keeps its `??`.
