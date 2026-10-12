---
'@barefootjs/jsx': patch
'@barefootjs/mojolicious': patch
'@barefootjs/twig': patch
'@barefootjs/go-template': patch
---

An optional-chained method call (`props.n?.toFixed(2)`, `props.s?.toUpperCase()`) on an absent value now renders empty on every adapter, alone and under a `??` fallback. A present `0` or `''` still calls the method, and `''` survives the `??`.

- The parser lowers the call to a `recv === null || recv === undefined ? undefined : recv.m(...)` guard.
- Mojolicious emits `x === null` / `x === undefined` as `!defined(x)`; the numeric `== undef` it emitted before also matched `0`.
- Twig tests a conditional left operand of `??` with `is null`, because its native `??` only accepts a variable.
- Go: an optional prop that is the receiver of such a call becomes nillable, an equality against `undefined` lowers to a nil test, the guard under `??` goes through `bf_nullish`, and a `.toFixed()` receiver written `props.x` is typed `float64`. The runtime's string helpers (`bf_upper`, `bf_trim`, …) accept any receiver, because a template pipeline also evaluates the discarded branch on a nil receiver.
