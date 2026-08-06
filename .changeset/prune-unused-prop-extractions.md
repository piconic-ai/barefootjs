---
"@barefootjs/jsx": patch
---

Stop the emitted init function from eagerly reading props it never uses.
`emitPropsExtraction` mirrored the component's destructuring for every
prop the reference graph marked as used — including template-only
references like `{children}` — and props arrive as getters over the
parent's reactive state, so a stray `const children = _p.children` in a
wrapper's init evaluated a slot-children getter that INSTANTIATES child
components. The duplicate instance attached a second event listener next
to the parent's own `upsertChild` wiring: a Label-wrapped Checkbox's
toggle cancelled itself out. A final AST pass
(`pruneUnusedPropExtractions`, mirroring `resolveFinalImports`'s shape)
now removes extraction consts the init body never references. The legacy
site pipeline masked this by registration order; Vite's ESM import order
(children registered before the parent's init runs) made it bite.
