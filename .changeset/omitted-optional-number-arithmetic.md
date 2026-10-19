---
"@barefootjs/jsx": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

Arithmetic over an omitted optional number prop (`props.n * 2`, `n + 1`, `-n` with `n?: number`) now renders `NaN` on the template adapters, as Hono does, instead of reading the omitted prop as `0`. The shared arithmetic lowering reads the prop's nil from its declared type: a prop that can only be absent reads it as `undefined` (`NaN`), a `number | null` prop keeps reading it as `null` (`0`), and a present value, `0` included, is unchanged. Unary minus now goes through the same coercion as binary `-`, so `-n` gives `NaN` for an omitted prop and `0` for a `null` one. On Go such a prop takes a nillable `interface{}` field so the absence reaches the template.
