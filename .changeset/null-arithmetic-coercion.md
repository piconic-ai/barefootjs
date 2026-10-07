---
"@barefootjs/jsx": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
---

Arithmetic over a signal whose SSR value can be `null` (`createMemo(() => s() * 2)` with `createSignal<any>(null)`) now renders JS's coerced result (`0`) on ERB, Jinja, Pebble and MiniJinja, instead of throwing at render on the native operator's nil operand. A possibly-nullish operand of `-`, `*`, `/`, `%` or `**` reads as `0`, as go-template's `bf.Mul` already did.
