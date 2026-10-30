---
"@barefootjs/jsx": patch
---

Client JS now declares a module-scope declaration that only a props destructure default reads (`const DEFAULT = 'm'` with `{ m = DEFAULT }`, a member read `{ m = D.label }`, a helper call `{ m = fmt('x') }`, through a default chain `{ a = DEFAULT, b = a }`, or a signal seeded from such a prop). The client reads the prop as `_p.m ?? DEFAULT`, but the declaration was dropped as unused, so mounting the component without that prop threw `ReferenceError: DEFAULT is not defined`. A name that a component-body binding of the same name shadows is left as it was.
