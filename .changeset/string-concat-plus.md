---
"@barefootjs/go-template": patch
---

Fix `'Hello, ' + name` rendering `"0"` on the Go template adapter.

Go's `html/template` has no native infix `+` at all — `binary()` always lowers JS `+` through a runtime call, `bf_add`, which coerces both operands to `float64` unconditionally. A string operand's `toFloat64` is `0`, so `'Hello, ' + name + '!'` computed `0 + 0 = 0` regardless of the actual strings.

JS `+` is addition only when both operands are numeric; it's concatenation the moment either side is a string. `binary()` (and the two other `case '+'` sites that independently re-derive the same lowering — a filter predicate's own `binary` case and a condition expression's `binary` case) now check `isStringConcatBinary` (the shared helper already consumed by Blade/Mojolicious/Twig/Xslate for the same JS `+` ambiguity) before falling to `bf_add`, routing to a new `bf_concat_str` runtime helper instead when either operand is string-typed.

`isStringConcatBinary` needs an `isStringName` predicate — whether a bare identifier holds a string value — which the Go adapter didn't have. Added `collectStringValueNames` (`props/prop-classes.ts`, ported from the Blade/Jinja-family adapters' own copy of the same function) and wired it into `CompileState.stringValueNames`.

`string-concat-plus` graduates from a render divergence to a passing render.
