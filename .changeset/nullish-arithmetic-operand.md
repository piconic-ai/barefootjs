---
'@barefootjs/jsx': patch
'@barefootjs/blade': patch
'@barefootjs/erb': patch
'@barefootjs/jinja': patch
'@barefootjs/mojolicious': patch
'@barefootjs/pebble': patch
'@barefootjs/rust': patch
'@barefootjs/twig': patch
'@barefootjs/xslate': patch
---

Arithmetic over a `null` operand renders like JavaScript on every DSL adapter: `null + 1` is `1`. The Jinja, MiniJinja and ERB templates raised on a nil operand under `+`, and on any prop declared `number | null` or optional, instead of reading it as `0`. The DSL adapters now take that decision from one place in `@barefootjs/jsx` (`arithmeticOperandCoercion`).
