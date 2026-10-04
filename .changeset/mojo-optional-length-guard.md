---
"@barefootjs/mojolicious": patch
---

An optional-chained `.length` read over an absent array or string (`(props.items?.length ?? 0) > 0`, `{props.label?.length ?? 0}`) no longer dies at render time on the Mojolicious adapter. The `.length` lowering dereferenced the receiver unconditionally (`scalar(@{$items})` → "Can't use an undefined value as an ARRAY reference") before the `// 0` fallback could run; an optional-chained read now guards the dereference and yields `undef` when the receiver is absent, as JavaScript yields `undefined`.
