---
'@barefootjs/jsx': minor
'@barefootjs/cli': patch
---

Reactive-factory helpers (#931 round 2, #2325): factories may now return a
shorthand object literal (`return { count, setCount }`) destructured as
`const { count } = factory(...)`, and may be imported from a relative path.
New diagnostics: BF111 (property renames in factory object returns/destructures),
BF112 (imported factory capturing helper-module bindings); BF110 now also covers
reactive-looking object-destructure call sites that previously failed silently.
CLI: dependency scanner tracks `.jsx`/`.js` relative imports for cache invalidation.
