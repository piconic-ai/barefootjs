---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

A module array const read with a literal index (`QS[0]`, `QS['1']`) or its `.length` now renders the element on every template adapter, in an attribute, text, a condition, a loop row and a child prop. Before, the template read `QS` as a variable it never receives, so the value was empty or the render failed. A module const that a prop or a component-scope binding of the same name shadows is no longer resolved to the module value. On Go Template, a module record read with a literal key (`REC.lf`) in a condition or passed as a child prop also resolves now.
