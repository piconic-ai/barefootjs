---
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
---

ERB, Jinja and MiniJinja: a `+` with a string-typed operand is now string concatenation, as on the other template adapters. The operand the shared layer does not type as a string goes through the runtime's JS `String()` first (Jinja and MiniJinja join with `~`), so `r.id + '-' + i` renders `x-0` and `'r=' + (-4 % 2)` renders `r=0` instead of raising a type error at render time. String typing follows the binding scope: a loop row or callback param named like a string prop is typed as the param.
