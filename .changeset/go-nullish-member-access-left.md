---
"@barefootjs/go-template": patch
---

Fix #2256: JS `??` nullish semantics now cover a single-hop member-access left operand rooted at a nillable optional-object prop (`user?.name ?? 'anonymous'`), not just a bare prop reference. Both `collectNullishConsumedPropNames` (the `interface{}`-flip seam) and the `??` emitter's `nillablePropNameOf` gate previously matched only `label` / `props.label` shapes, so `user?.name ?? '…'` fell through to the truthiness-based `or` — collapsing a present-but-empty `""` member into the fallback where JS keeps it. Both now recognize the ROOT of a single-hop member chain (`user` in `user?.name`); an optional-object prop already lowers to nillable `map[string]interface{}` by construction, and the existing `bf_get` nil-safe `?.` lowering already returns Go `nil` on a missing root, so gating on the root is sufficient — no new runtime helper needed. A deeper chain (`props.user?.name`, `user?.address?.city`) is unaffected — same single-hop `?.` caveat already documented on the `member` `ParsedExpr` variant.

Removes the `optional-chaining-prop:empty-name` `skipDataPoints` pin.
