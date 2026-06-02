---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
---

Lower `String.prototype.repeat(n)` to the template-language adapters (#1448 Tier B).

`value.repeat(3)` now compiles to both template adapters (the receiver concatenated `n` times).

- Parser: new `array-method` variant `repeat`, dropped from `UNSUPPORTED_METHODS`. Full JS arity: the no-argument form is `repeat(0)` → `""` (JS coerces the missing count to 0, not a `RangeError`), and a second+ argument is ignored.
- Go: new `bf_repeat` runtime helper (`strings.Repeat`).
- Mojo: new `bf->repeat` helper (Perl's `x` operator).

JS throws `RangeError` for a negative count; both adapters instead clamp a count `<= 0` to the empty string so SSR templates degrade rather than crash the render, and truncate a fractional count toward zero (matching JS's `ToIntegerOrInfinity`). Go and Perl stay byte-equal.
