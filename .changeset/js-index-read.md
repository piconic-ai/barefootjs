---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
"@barefootjs/blade": patch
"@barefootjs/perl": patch
"@barefootjs/php": patch
"@barefootjs/erb": patch
"@barefootjs/pebble": patch
---

An index read (`a[k]`, `obj['a.b']`, `rows[1.1]`) now gives the JS answer on every template adapter and in every runtime's callback evaluator, decided once by the shared primitive plan (#3824 step 2).

- An array, and a string, are read only through a canonical array index: `1`, `'1'` and `-0` read an element; `'01'`, `'1e0'`, `'-0'`, `1.1` and `-1` read nothing. A string reads one UTF-16 code unit (`'a😀b'[3]` is `'b'`). An object reads its own key by the key's string (`o[1]` reads `o['1']`, `o[null]` reads `o['null']`).
- The template helper `get` (PHP's `index`) and the callback evaluator's index read are one implementation on every runtime. The evaluators of Ruby, Perl, Java and Go no longer convert a list key with ToNumber, so `rows.map(r => r[k])` reads nothing for `k = '01'` (#3802).
- Jinja and MiniJinja spell their native `[]` only for a loop index on a proven array, and `bf.get` otherwise, so the string key `'1'` reads element 1 (#3802).
- Go reads a literal key through `bf_get` instead of a field derived from the key, so `obj['a.b']`, `obj['*']` and `rows[1.1]` render (#3795). Go filter predicates accept an index read.
- Blade reads a literal identifier key (`obj['id']`) through `$bf->index` like every other literal key.
