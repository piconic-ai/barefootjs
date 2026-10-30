---
"@barefootjs/php": patch
"@barefootjs/blade": patch
"@barefootjs/twig": patch
---

Blade and Twig: an index `obj[k]` now reads only the own key or element, as JavaScript does (#3744). Blade read it through Laravel's `data_get`, which takes its key as a path, so a key containing a dot (`'a.b'`) read the nested `a.b` instead of the own `"a.b"` key, `'*'` read every value, and a fractional index (`xs[1.1]`) read `xs[1][1]`. Twig's `attribute()` truncated a fractional index, so `xs[1.1]` read `xs[1]`. Both now go through the new runtime helper `index`, which turns the key into the name JavaScript reads (`-0` reads index `0`, `1.1` reads no element) and replaces `index_key`. On Blade, a member name that is not an identifier (`obj['a.b']`, a destructured `{ 'a.b': x }` row) goes through it too.

The callback evaluator's index read (`rows.map(r => r[k])`) now calls the same implementation, so a read gives the same answer inside a callback as in the template: a list is read only through a canonical index (`1` or `'1'`), and `'01'`, `'-0'`, `'1e0'`, `true` or `null` read no element, where the evaluator used to convert the key to a number first.
