---
"@barefootjs/jsx": patch
---

`augmentInheritedPropAccesses` (shared by the Go and Mojo adapters) now sees `props.X` reads inside template-literal attribute *parts* and inside if-statement/conditional branches. Previously a `className={`… ${props.className ?? ''}`}` or an asChild early-return branch could reference a prop in the emitted template that the generated props type never declared.
