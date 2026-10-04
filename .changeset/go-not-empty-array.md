---
"@barefootjs/go-template": patch
---

JS `!x` now follows JS truthiness on Go. It used to lower to Go's built-in `not`, which treats an empty slice or map as false, so `!tags()` on `[]` took the wrong branch (e.g. `createQuery`'s mode B rendered the skeleton for an empty result instead of the empty list). Every `!` emitter (value, condition and filter-predicate positions) now goes through one decision, `lowerJsNot`: an operand that is already a Go bool keeps `not`, and anything else lowers to `not (bf_truthy x)`. A memo whose body is a negation (`createMemo(() => !open())`) is now computed at SSR as `!bf.Truthy(...)` instead of keeping the Go zero value `false`.

The runtime's `bf.Truthy` (`isTruthy`) now reads every Go nil as JS null/undefined: a typed nil slice, map, pointer or interface (an absent optional prop) is falsy, while a non-nil empty slice or map (`[]`, `{}`) stays truthy, and a non-nil pointer reads through to its value. `bf.Filter` returns an empty slice rather than nil when nothing matches, since its result is a JS array.
