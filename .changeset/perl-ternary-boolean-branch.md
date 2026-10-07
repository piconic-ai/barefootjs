---
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

A non-boolean attribute bound to a ternary whose taken branch is boolean and whose other branch is not (`data-choice={yes() ? false : s()}`, `data-c={yes() ? n() > 0 : 'x'}`, `data-d={yes() ? false : undefined}`) now renders JS `String(boolean)` (`"false"` / `"true"`) instead of Perl's `0` / `1` / `''`.
