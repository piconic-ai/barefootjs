---
"@barefootjs/go-template": patch
---

Go runtime: `bf_div` / `bf.Div` is now IEEE division, so `/` over a zero divisor renders JavaScript's `Infinity`, `-Infinity` or `NaN` instead of `0` (#3692). This covers a `null` divisor (`2 / null` is `Infinity`), the `-0` remainder of a negative dividend (`1 / (-4 % 2)` is `-Infinity`) and a string index computed that way. A memo dividing by the literal `0` (`createMemo(() => count() / 0)`) now builds and computes through `bf.Div` like any other literal divisor, where it used to fail `go build`.
