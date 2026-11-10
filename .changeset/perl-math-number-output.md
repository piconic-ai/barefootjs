---
"@barefootjs/jsx": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/perl": patch
---

The Mojolicious and Xslate adapters print the result of a number-returning builtin (`Number(x)`, `Math.abs` / `min` / `max` / `floor` / `ceil` / `round`) as JS does, in text, attributes, memos and loop rows (#3872). `isNumberValuedExpr` now counts these calls as number-valued, so their output goes through the runtime's `Number::toString` helper (`bf->string`) rather than Perl's own stringification. Before this change, Perl's `%.15g` dropped digits (`Math.max(0.1 + 0.2, 0)` rendered `0.3`, JS `0.30000000000000004`), and a perl built with `-Duselongdouble` added them (`Math.abs(-7.6)` rendered `7.59999999999999964`). `t/template_primitives.t` in the `BarefootJS` CPAN dist now compares the `abs` results as doubles, so it passes on a `-Duselongdouble` perl.
