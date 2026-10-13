---
'@barefootjs/perl': patch
'@barefootjs/mojolicious': patch
'@barefootjs/xslate': patch
---

Mojolicious and Xslate templates compute `+ - * /` through new runtime helpers (`bf->add` / `subtract` / `multiply` / `divide`) instead of Perl's native operators, so the result is the IEEE double JS computes: an integer sum past 2**53 rounds as a double, a perl built with `-Duselongdouble` or `-Dusequadmath` no longer keeps extra precision (`0.1 + 0.2` is `0.30000000000000004` there too), and dividing by zero yields `Infinity` / `NaN` instead of dying. `bf->to_fixed` scales at double precision, so `(1.005).toFixed(2)` is `1.00` on such perls as well.
