---
"@barefootjs/jsx": patch
---

A component-scope const that reads a parameter prop whose default is not a primitive literal (`{ b = ['y'] }`, `const local = [b.length, 'z']`) now applies that default in the client `template:`. The template binds each such prop with its default once per evaluation, in its top scope, and the inlined const reads that binding, so a client mount with the prop omitted renders what the server renders instead of throwing or rendering empty. A default that names a module binding the component body binds again keeps the previous read.
