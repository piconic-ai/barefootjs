---
"@barefootjs/go-template": patch
---

A memo that divides a number prop, a destructured number prop or a getter by an integer literal (`createMemo(() => props.value / 8)`) now renders the JavaScript quotient (`154320986.25`) through the shared `bf.Div` runtime helper, instead of Go's truncating integer division (`154320986`).
