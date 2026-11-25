---
"@barefootjs/jsx": patch
---

`exprToString` and `stringifyParsedExpr` now parenthesize an operand that binds looser than its position, so a printed expression keeps its tree: `(size ? A : B).xmlns` no longer prints as `size ? A : B.xmlns`, nor `(a + b) * c` as `a + b * c`. A server-render seed computed from a local helper whose body reads a member on a conditional, logical or binary operand (`() => (on ? 'abc' : 'de').length`) now renders the value JS computes on every template adapter instead of the last arm's read.
