---
"@barefootjs/jsx": patch
---

Derive the client-JS reference graph's edges for IR expression text (templates, handlers, effects) and module function bodies from AST free identifiers instead of a token scan. A member name, an object key or a callback parameter no longer keeps a same-named module declaration alive in `initX` (a server-only `const label = process.env.X` threw a `ReferenceError` at hydrate when a handler read `D.label`). Members of the props object and the rest bag still count as uses of those props. A text that does not parse keeps the token-scan fallback.
