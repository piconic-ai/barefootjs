---
"@barefootjs/go-template": patch
---

An omitted optional prop forwarded into a child's optional prop that the child reads with `??` (or another nil-sensitive read) now reaches the child as nil, so the child takes its fallback as in Hono instead of rendering `0` or `NaN`. This holds when the prop is forwarded directly (`props.x`, `props['x']`, a destructured `x`), through a const (`const c = props.x`) or through an identity memo (`createMemo(() => props.x)`), and whatever the order the components are declared in. A nillable `number` field no longer goes through `bf.Number`. A destructured prop with a default (`{ count = 0 }`, `false`, `''`, or a non-zero default) is still forwarded as its defaulted value.
