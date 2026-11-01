---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/perl": patch
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/blade": patch
"@barefootjs/php": patch
"@barefootjs/pebble": patch
"@barefootjs/erb": patch
---

Number literals and unary `-` now compute and print as in JS on every template adapter (#3824 step 6).

- A number literal is spelled from the shared primitive plan. A safe integer stays a host literal. Any other literal (`1e21`, `1e-7`, `1e20`, `0.1`, `9007199254740993`) is the runtime's `number` over its JS spelling, so Go no longer panics with `integer overflow`, Pebble and Xslate parse exponent literals, and Perl prints `1e-7`, not `1e-07` (#3814). A `-0` literal is `neg(0)`, so `1 / -0` is `-Infinity` (#3819). This also covers module and local scalar consts (`const NZ = -0`, `const BIG = 1e21`) and the Go constructor's literal child props and seeds.
- A unary minus over a non-zero literal folds into the literal. Over any other operand it calls the runtime's `neg`, which is JS `-ToNumber(x)` and keeps the sign of zero. `neg` now coerces a numeric string on Go and Java, and returns `-0` for a zero operand on Go, Perl, Ruby and Java.
