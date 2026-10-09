---
'@barefootjs/jsx': patch
'@barefootjs/blade': patch
'@barefootjs/twig': patch
'@barefootjs/erb': patch
'@barefootjs/jinja': patch
'@barefootjs/rust': patch
'@barefootjs/pebble': patch
'@barefootjs/mojolicious': patch
'@barefootjs/xslate': patch
'@barefootjs/go-template': patch
---

Arithmetic over a signal whose SSR value is `undefined` now renders `NaN` on every template adapter, as JavaScript does (#3390). This covers `createSignal(undefined)`, a zero-arg `createSignal()`, and a memo over either. The template engines hold `undefined` and `null` as the same nil, so the operand used to throw (ERB, Jinja, Pebble, MiniJinja) or read as `0`. The compiler now recognises such an operand (`arithmeticOperandIsUndefined`) and routes it through the runtime's JS `Number()`, which maps nil to `NaN`. Pebble spells the NaN out, and Go seeds such a memo with `bf.Number(nil)`.
