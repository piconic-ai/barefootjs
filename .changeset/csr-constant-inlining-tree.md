---
"@barefootjs/jsx": patch
---

The client template inlines a component constant on the expression tree. A constant's name in a template literal's static text (`` `btn size-${size}` ``), a member name, or a string is no longer replaced, and an object-literal shorthand (`{ size }`) expands to `size: (value)` instead of producing invalid JavaScript.
