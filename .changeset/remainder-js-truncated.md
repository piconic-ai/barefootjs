---
"@barefootjs/jsx": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/perl": patch
"@barefootjs/php": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

`%` renders JS's remainder on every template adapter. The result takes the sign of the dividend (`-7 % 2` is `-1`, `7 % -2` is `1`), keeps a fraction (`7.5 % 2` is `1.5`), and is `NaN` for a zero divisor or a `NaN` dividend. Before, ERB, Jinja, Mojolicious, Xslate and MiniJinja took the divisor's sign, Blade, Twig, Xslate and Go truncated the operands to integers, and an integer zero divisor raised on Pebble and MiniJinja and gave `0` on Go. `@barefootjs/jsx` exports `arithmeticHelper`, which routes `%` to the runtime's `mod` helper; each adapter only spells the call. The Ruby runtime gains `bf.mod` and the Perl runtime `mod`, both shared with their evaluator's `%`. Go's `bf_mod` computes the JS remainder and keeps an `int` result for two `int` operands, and the Python runtime's `mod` keeps an `int` result for two `int` operands. A zero remainder of a negative dividend is JS's `-0`, so `1 / (-4 % 2)` is `-Infinity`: Ruby and Go give the float `-0.0` there, which still indexes a list as `0` and prints `0`, and the Python runtime an `int` `0` that converts to `-0.0`. The PHP runtime's `mod` gives the `int` `0` for a zero remainder of two `int` operands, since Blade's `data_get` reads the float `-0.0` as the key `"-0"`; that keeps the index and drops the sign. The Python and PHP evaluators sign an infinity by a negative-zero divisor (`1 / -0` is `-Infinity`).
