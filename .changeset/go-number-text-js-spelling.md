---
"@barefootjs/go-template": patch
---

An arithmetic result rendered as text (`{props.value + 0.5}`, `{n() / 4}`, a template-literal interpolation of one) now uses the JavaScript number spelling on the Go adapter, as Hono renders it (`1234567890.5`). The `bf_add`/`bf_sub`/`bf_mul`/`bf_div` result is a boxed `float64`, which `html/template` printed with Go's `%v` (`1.2345678905e+09`); such a text value now prints through `bf_string`, whose number formatting follows JavaScript's decimal/exponent thresholds.
