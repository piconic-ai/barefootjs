---
"@barefootjs/go-template": patch
---

A nullable signal seeded from an optional, default-less prop (`createSignal<string | undefined>(props.initial)`) now keeps the prop's absence on Go: the prop's Input/Props field and the signal's field are `interface{}`, so an omitted prop leaves the signal `nil` and an attribute bound to it (`title={label()}`) is omitted, as on Hono, while a supplied `''` / `0` still renders. Go code that set such a prop's Input field passes the value as before (plain literals assign into `interface{}`); code that read it as a `string` / `float64` type-asserts instead.
