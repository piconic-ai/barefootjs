---
'@barefootjs/go-template': patch
---

`??` over an optional array prop now keeps a present empty array (#3362). It lowered to html/template's truthiness-based `or`, which treats an empty slice as falsy, so `(props.c ?? props.a).length` with `c = []` read `a`. A slice-typed prop now takes the `bf_nullish` path, which falls back only on a nil (absent or null) slice.
