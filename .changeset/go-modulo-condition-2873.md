---
"@barefootjs/go-template": patch
---

Fix #2873: `%` (modulo) inside a ternary/`&&`/`||` condition (e.g. `class={i % 2 === 0 ? 'even' : 'odd'}`) compiled to a Go template that panicked at render time (`unexpected "%" in operand`) instead of rendering. `renderConditionExpr`'s binary-operator switch had no `%` case — unlike the general (non-condition) binary emitter, which already lowers `%` to the existing `bf_mod` runtime helper — so the `default` arm emitted a literal ` % ` into the generated template text, which `html/template` can't parse. The `.filter()`/`.find()`/etc. predicate emitter (`renderFilterExprNode`'s binary case) had the identical gap and is fixed the same way, mirroring the general emitter's `bf_mod` case in both places.
