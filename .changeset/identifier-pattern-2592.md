---
'@barefootjs/jsx': patch
---

Fix `$`-containing identifiers (`$item`, `count$`, `a$b`) being silently dropped from reactivity/loop-param classification and accessor-wrapping — the compiler's `new RegExp(`\\b${name}\\b`)` identifier-reference heuristic treated an unescaped `$` as a regex anchor and, even escaped, `\b` doesn't recognize `$` as identifier-like, so a leading/trailing `$` broke the boundary match (#2592).
