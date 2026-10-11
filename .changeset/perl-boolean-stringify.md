---
'@barefootjs/mojolicious': patch
'@barefootjs/xslate': patch
'@barefootjs/perl': patch
---

A boolean stringified in a template (`String(flag)`, a template literal, a boolean loop key) now renders `true` / `false` instead of Perl's `1` / `0`. The runtime's `string` helper prints a JSON boolean as JS does, and template-literal substitutions go through it.
