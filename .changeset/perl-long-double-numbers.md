---
'@barefootjs/perl': patch
---

The evaluator computes and prints numbers as IEEE doubles on a perl built with `-Duselongdouble` or `-Dusequadmath`. Such a perl keeps a wider NV, so `0.1 + 0.2` printed `0.3` instead of JS's `0.30000000000000004` and `t/evaluator.t` failed there (#3445). Numbers are now rounded to a double where they enter the evaluator, after each arithmetic step, and before formatting; with an 8-byte NV this changes nothing.
