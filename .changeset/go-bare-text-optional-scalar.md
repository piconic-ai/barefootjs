---
"@barefootjs/go-template": patch
---

Fix #2267: an absent defaultless optional scalar prop consumed as a bare TEXT expression (`{size}` for `size?: number`, no `??`/attribute involvement) now renders empty on Go, matching the JS reference (`undefined` → ""), instead of the concrete field's zero value (`0`).

`resolvePropGoType`'s existing `interface{}` nillable flip (previously driven only by `??` consumption, #2248, and bare-omittable-attribute consumption, #2259) now also covers bare text-position consumption via a new `collectTextConsumedPropNames` collector. The text emitter (`renderExpression`) routes a flipped prop's bare reference through the runtime's nil-safe `bf_string` stringifier (`""` for nil, otherwise identical formatting to `text/template`'s own default printing) instead of a raw `{{.X}}` — a bare `{{.X}}` would print a nil `interface{}` as the literal `<no value>`, not empty.

Adds the `bare-text-optional-scalar` fixture (adapter-tests) pinning the `present` / `absent` / `zero` data points.
