---
"@barefootjs/perl": patch
---

`t/template_primitives.t` passes on a perl built with `-Duselongdouble` or `-Dusequadmath` (#3872). Two `json` number cases built their input with Perl's own `0.1 + 0.2`, which on such a perl is the wider NV nearest 0.3 and rounds to the double `0.3`, so the test fed `json` a different number than JS computes. The inputs now come from the evaluator's arithmetic (`BarefootJS::Evaluator::_binary`), which works in doubles as JS does. The runtime itself is unchanged.
