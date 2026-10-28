---
"@barefootjs/mojolicious": patch
"@barefootjs/perl": patch
---

Mojolicious: `===` / `!==` between operands whose type the compiler cannot tell (an `.at()` result, an array element, a prop typed as a union) now compares by the values' JS types through the new runtime helper `strict_eq`. Before, it lowered to Perl's numeric `==`, which reads two different non-numeric strings as equal (`'p' === 'q'` rendered as true). A comparison with a string operand still uses `eq` / `ne`, and one with a number or boolean operand still uses `==` / `!=`.

An object or array compared with `===` / `!==` (in a template, an evaluated callback, or `includes`) now compares by reference on the Perl runtime: a value equals itself, and two distinct structures with the same contents are not equal. Before, `strict_eq` and the evaluator's `===` treated every object or array as unequal, even to itself.
