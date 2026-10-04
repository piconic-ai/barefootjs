---
"@barefootjs/go-template": patch
---

A `number[]` prop or signal on the Go adapter can now hold fractional values (`[1.5, -2.5]`), which render as Hono renders them. Its generated Go field type changes from `[]int` to `[]interface{}`; `[]int` rejected a fractional element at compile time (`cannot use 1.5 … as int value`). Integer elements still arrive as Go ints, so integer data renders and compares as before. Go code that builds a component's `Input` with a `[]int{…}` literal for such a field needs a `[]interface{}{…}` literal instead. Comparing a fractional element against an integer literal inside a row (`value > 0`) still fails at render time on Go; it is tracked as `fractional-number-compare-int-literal`.
