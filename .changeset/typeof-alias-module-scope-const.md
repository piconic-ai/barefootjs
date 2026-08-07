---
"@barefootjs/jsx": patch
"@barefootjs/hono": patch
---

A type alias re-emitted at module scope now keeps the const it queries with
`typeof` in scope. Type declarations are emitted verbatim at module scope
while a source module's constants are localised into each component body, so
`export type IconName = keyof typeof strokePaths | 'github'` lost its
referent — TS2304, and worse, an unresolved `keyof typeof` degrades to
`keyof any`, silently widening the alias to `string | number | symbol` so it
stopped rejecting invalid values. Such consts are now hoisted to module
scope alongside the type, the way `createContext()` bindings already were.
Type-only — no emitted-JS or rendered-HTML change.
