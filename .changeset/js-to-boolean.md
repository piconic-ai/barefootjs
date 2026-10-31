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
---

Every position that tests a value (`if`, `?:`, `!`, `&&`, `||`, a `.filter()` / `.every()` / `.some()` / `.find()` predicate) now gives the JS answer on every template adapter, decided once by the shared primitive plan (#3824 step 1).

- Mojolicious and Xslate test through the runtime's JS `Boolean()` (`truthy`) unless the operand is a proven boolean: the string `"0"` is truthy and `NaN` falsy, as in JS (#3823). `a && b` and `a || b` still yield an operand, not a boolean.
- Go templates no longer test with Go's own truthiness, which read an empty slice or map as false and `NaN` as true: `{{if}}` conditions, filter predicates and `&&` / `||` go through `bf_truthy` unless the operand is a proven boolean, and keep their short circuit.
- Jinja, MiniJinja, Twig, Blade and Pebble test a required `boolean` prop or a `boolean`-typed signal or memo natively instead of through `truthy`; the answer is unchanged.
