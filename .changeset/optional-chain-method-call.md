---
'@barefootjs/jsx': patch
'@barefootjs/mojolicious': patch
'@barefootjs/twig': patch
---

An optional-chained method call (`props.n?.toFixed(2)`, `props.s?.toUpperCase()`) on an absent value now renders empty on every adapter, alone and under a `??` fallback. The parser lowers it to a `recv === null || recv === undefined ? undefined : recv.m(...)` guard, so a present `0` or `''` still calls the method. Mojolicious now emits `x === null` / `x === undefined` as `!defined(x)` instead of a numeric `== undef` that also matched `0`. Twig tests a conditional left operand of `??` with `is null`, because its native `??` only accepts a variable.
