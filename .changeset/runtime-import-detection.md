---
"@barefootjs/jsx": patch
---

The client JS imports a runtime helper only when the emitted code references it unbound. A string, a property name, or a local of the same name no longer pulls in an import, and a component that declares and calls a function named like a runtime helper (`formatDate`, say) now gets error BF057 instead of a duplicate-declaration SyntaxError.
