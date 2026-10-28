---
"@barefootjs/mojolicious": patch
"@barefootjs/perl": patch
---

Mojolicious: `===` / `!==` between operands whose type the compiler cannot tell (an `.at()` result, an array element, a prop typed as a union) now compares by the values' JS types through the new runtime helper `strict_eq`. Before, it lowered to Perl's numeric `==`, which reads two different non-numeric strings as equal (`'p' === 'q'` rendered as true). A comparison with a string operand still uses `eq` / `ne`, and one with a number or boolean operand still uses `==` / `!=`.
