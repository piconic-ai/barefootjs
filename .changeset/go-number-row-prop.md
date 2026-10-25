---
"@barefootjs/go-template": patch
---

A child component loop over a `number[]` prop that passes the row itself as a number prop (`values.map(n => <Num key={n} value={n} />)`) now builds on the Go template adapter. A `number[]` prop is `[]interface{}` in Go, so each row arrives boxed, and the constructor assigned it to the child's `float64` field as is, which `go build` rejected. The constructor now unboxes the row with `bf.ToFloat64` (#3625).
