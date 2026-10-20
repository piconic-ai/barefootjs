---
"@barefootjs/jsx": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/perl": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

`%` renders JS's remainder on every template adapter. The result takes the sign of the dividend (`-7 % 2` is `-1`, `7 % -2` is `1`), keeps a fraction (`7.5 % 2` is `1.5`), and is `NaN` for a zero divisor or a `NaN` dividend. Before, ERB, Jinja, Mojolicious, Xslate and MiniJinja took the divisor's sign, Blade, Twig, Xslate and Go truncated the operands to integers, and an integer zero divisor raised on Pebble and MiniJinja and gave `0` on Go. `@barefootjs/jsx` exports `arithmeticHelper`, which routes `%` to the runtime's `mod` helper; each adapter only spells the call. The Ruby runtime gains `bf.mod` and the Perl runtime `mod`, both shared with their evaluator's `%`. Go's `bf_mod` computes the JS remainder and keeps an `int` result for two `int` operands, and the Python runtime's `mod` keeps an `int` result for two `int` operands.
