---
"@barefootjs/go-template": patch
---

Read a member of a plain scalar loop row as a read of the row value (`props.words.map(g => <li>{g.length}</li>)`). Before, `g.length` lowered to a `.Length` field that a string does not have, and the render failed. It now lowers to `bf_length .` in text, attributes, conditions, preamble locals, child props and fused `.filter()` predicates. A condition's `.length` on a scalar row, including an enclosing row read from an inner loop, counts UTF-16 code units as JS does, not bytes. A row's Phase 1 scalar type is also used when the array's declared element type can't be read (`(string | null)[]`).
