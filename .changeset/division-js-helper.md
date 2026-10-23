---
"@barefootjs/jsx": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/php": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

`/` renders JS's division on every DSL template adapter. `arithmeticHelper` in `@barefootjs/jsx` now routes `/` to the runtime's `div` helper, next to `%` and `mod`, and each adapter only spells the call (`bf.div`, `$bf->div`, and `divide` on the Perl runtime). Before, ERB, Go, Mojolicious and Xslate each routed `/` to their runtime on their own, and Blade, Twig and Jinja used the engine's `/`, which raises on a zero divisor in PHP and Python. Now `1 / 0` is `Infinity`, `-1 / 0` is `-Infinity` and `0 / 0` is `NaN` there too. The PHP runtime gains `div`, which reads a nil operand as `0` like PHP's `/` and keeps PHP's own quotient for two int operands and a non-zero divisor. The PHP runtime's `mod` now reads a nil operand as `0` too, so `null % 2` renders `0` on Blade and Twig instead of `NaN`. The Python runtime gains `div`, and the MiniJinja runtime `div` (`num::js_div`). ERB, Go, Mojolicious and Xslate emit the same templates as before.
