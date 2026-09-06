---
"@barefootjs/go-template": patch
---

Fix #2758 fallout: the Go adapter's `!` (unary not) lowering didn't parenthesize a multi-token argument the way `&&`/`||` already do, so negating a compiled `||` chain (e.g. `!(a || b)`, the new controlled-`<select>` no-match placeholder's `selected` condition) emitted `not or a b` — a Go `html/template` prefix call, which parses as `not` given 3 sibling args instead of 1 and fails with "wrong number of args for not: want 1 got 3". Both `!` emitters (the general expression emitter and the `{{if}}`-condition emitter) now wrap a multi-token operand in parens, matching the existing `&&`/`||`/comparison emitters' own convention.
