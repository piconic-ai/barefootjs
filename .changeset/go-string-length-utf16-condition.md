---
"@barefootjs/go-template": patch
---

Count a string's `.length` in a condition as JS does (UTF-16 code units), not as Go's `len` does (UTF-8 bytes). `{props.word.length > 3 ? 'long' : 'short'}` with `word: '日本語'` rendered `long`; it now renders `short`, as Hono does. Every condition `.length` now lowers to `bf_length` (props, signals, memos, locals, loop rows, and receivers of unknown type). Only a receiver whose declared type is an array keeps `len`, which gives the same element count.
