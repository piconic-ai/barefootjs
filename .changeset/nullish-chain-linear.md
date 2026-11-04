---
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
"@barefootjs/erb": patch
"@barefootjs/twig": patch
---

A value-position `a ?? b ?? c …` chain now renders each operand once on Jinja, MiniJinja, ERB and Twig, so its template grows linearly instead of exponentially (#3839). Jinja and MiniJinja rendered the left operand three times and ERB twice, so a 16-operand chain produced hundreds of megabytes of template. The left operand is now boxed by a runtime presence test, as `&&` / `||` already were: `bf.keep_nonnil(l)` keeps `l` unless it is null or undefined (Jinja's `Undefined` included), so `0`, `''` and `false` are kept and the right operand is evaluated only when needed. Twig's own `??` still takes a variable left operand; a nested `??`, a conditional or an optional `.length` goes through the new `bf_js_nullish` filter.

- Jinja: a custom backend passed to the Python runtime must now implement `is_undefined(value)`; `JinjaBackend` does.
