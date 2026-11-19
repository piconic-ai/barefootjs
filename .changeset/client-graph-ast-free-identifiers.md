---
"@barefootjs/jsx": patch
---

Derive the client-JS reference graph's edges for IR expression text (templates, handlers, effects) and module function bodies from facts the analyzer records in Phase 1 (`IRMetadata.sourceFacts`: free identifiers and `object.member` reads of the AST each text is printed from), instead of a token scan. A member name, an object key or a callback parameter no longer keeps a same-named module declaration alive in `initX` (a server-only `const label = process.env.X` threw a `ReferenceError` at hydrate when a handler read `D.label`). A member read through the props object, the rest bag or a component constant that aliases one (`const p = props; p.n`) still counts as a use of that prop. A text Phase 2 builds itself has no recorded facts and keeps the token-scan fallback.
