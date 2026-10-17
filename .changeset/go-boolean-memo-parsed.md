---
"@barefootjs/go-template": patch
---

An untyped memo is typed `bool` only when its parsed body yields a boolean. A comparison in a ternary's test (`props.sel === 'b' ? props.items.length : n()`) no longer makes the memo `bool` and render `false`.
