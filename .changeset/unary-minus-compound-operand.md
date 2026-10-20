---
"@barefootjs/jsx": patch
"@barefootjs/blade": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

Unary minus over a compound operand keeps its grouping on every template adapter. `-(n + 1)` rendered `-n + 1` on Blade, Twig, Jinja, MiniJinja and Pebble, and Go emitted `bf_neg bf_add .N 1`, which fails to parse; a negated negation `-(-n)` became `--n`, a decrement in PHP and Perl. `@barefootjs/jsx` exports `groupUnaryOperand`, which every adapter now applies to the operand of unary minus.
