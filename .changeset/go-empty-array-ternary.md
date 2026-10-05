---
"@barefootjs/go-template": patch
---

A bare value used as a ternary or `if` test (`{tags() ? 'has tags' : 'no tags'}`, `{r.tags ? … : …}`) now takes JS truthiness on Go, as Hono does. Go's `{{if}}` reads an empty slice or map as false, so an empty array or empty object rendered the second branch; the test now goes through `bf_truthy`, which keeps an absent value falsy and an empty array or object truthy. A test that is already a boolean expression (a comparison, `!x`) is unchanged, and the value-position ternary test shares the same decision (`lowerJsTruthyTest`).
