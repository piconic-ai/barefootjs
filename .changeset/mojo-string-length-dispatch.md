---
"@barefootjs/mojolicious": patch
---

Dispatch `.length` on receiver type in the Mojolicious top-level emitter. A `.length` access lowered unconditionally to Perl's array form `scalar(@{$x})`, which dereferences the value as an array ref and returns 0 for a scalar string — so `word.length` on a `string` prop rendered `0` instead of the character count. The emitter now emits Perl's scalar `length($x)` when the receiver is string-typed (a known string prop/getter via `isStringTypedOperand`, or a bare identifier bound to one via the `_isStringValueName` witness the `eq`/concat lowering already consults) and keeps `scalar(@{...})` for array receivers. The `string-length-text` fixture graduates from Mojolicious's `renderDivergences`.
