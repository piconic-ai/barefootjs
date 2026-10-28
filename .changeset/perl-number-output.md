---
"@barefootjs/jsx": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

Mojolicious and Xslate now print a number-valued memo, signal or prop the way JS stringifies it. A memo dividing by zero rendered Perl's `Inf` / `-Inf` instead of `Infinity` / `-Infinity`, and a fraction past 15 significant digits (`2 / 3`) rendered Perl's `0.666666666666667` instead of `0.6666666666666666`. The fix covers attributes, text, ternary branches, `&&`, template literals, string concatenation, loop rows, and a `number` prop that a child prints.
