---
"@barefootjs/go-template": patch
---

Go: an optional `string` / `number` / `boolean` prop with a destructure default other than its empty value (`{ tag = 'z' }`, `{ n = 2 }`, `{ on = true }`) now keeps an explicit `''` / `0` / `false` from the caller instead of rendering the default. Such a prop's `Input` and `Props` fields are now `interface{}`, so an absent prop (nil) is told apart from an empty one, and `NewXxxProps` applies the default to a nil field before anything reads it. Assigning a plain value to the field is unchanged; Go code that reads the field as a `string` / `float64` / `bool` needs a type assertion. The default now also reaches a signal seed, a memo and a child prop when the prop is absent, which used to read the empty value.
