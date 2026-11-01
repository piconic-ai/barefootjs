---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/blade": patch
"@barefootjs/pebble": patch
"@barefootjs/erb": patch
"@barefootjs/perl": patch
"@barefootjs/php": patch
---

The relational operators `<` `<=` `>` `>=` and unary `+` now give the JS answer on every template adapter, decided once by the shared primitive plan (#3824 step 3).

- A comparison is native only when Phase 1 proves both operands are numbers (a declared `number` prop counts; the host must pass JSON-typed values). Any other comparison calls the runtime's `lt` / `le` / `gt` / `ge`, JS Abstract Relational Comparison: two strings compare by UTF-16 code unit (`'10' < '9'` is true), anything else through ToNumber (`'10' < 9` is false, `' 3 ' < 4` is true, `null < 1` is true), and `NaN` makes every comparison false. ERB, Jinja and Pebble no longer raise on a string compared with a number, and MiniJinja no longer compares it as strings (#3805). An omitted optional number prop reads as `undefined` there, so it compares false.
- MiniJinja always calls the helper: its own comparison orders `NaN` above every number.
- A unary `+` over anything but a proven number calls the runtime's `to_number` (JS ToNumber) instead of being dropped or spelled natively.
- The helpers and each runtime's callback evaluator share one relational implementation. The evaluators of Python, Ruby, Perl, PHP, Go and Rust compare strings by UTF-16 code unit instead of code point (`'😀' < '｡'` is true), and Java holds `-0` and `0` equal.
- Each runtime's JS ToNumber (`to_number`, and the evaluator's) reads `0x10`, `0o17` and `0b11` as their values and the lower-case `infinity` as `NaN`; Perl reads `'-0'` as `-0`. The display helper `number` keeps its documented divergences.
