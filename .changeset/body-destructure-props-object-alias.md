---
"@barefootjs/jsx": patch
---

A component-body object destructure that reads the props object through a `const` alias (`const p = props; const { value, label = 'none' } = p`, also through a chain of `const` aliases) now compiles like `const { value, label = 'none' } = props`. The compiler dropped the destructure with no diagnostic, so every read of a destructured name was unbound: Hono SSR threw a `ReferenceError` and the client JS read undefined names.
