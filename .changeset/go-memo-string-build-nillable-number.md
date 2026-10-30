---
"@barefootjs/go-template": patch
---

A memo that builds a string from a prop that is not a plain Go `string` (a template literal or a `+` concatenation over an optional prop a sibling signal seeds with `??`, or over a number prop) no longer fails `go build`. Its SSR value is computed by the evaluator with JS's string conversion. A `+` concatenation of a string literal and a number signal (`'a=' + a()`) is now typed as a string memo, so it renders `a=1` instead of `NaN`.
