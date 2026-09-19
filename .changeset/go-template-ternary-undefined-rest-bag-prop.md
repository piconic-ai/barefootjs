---
"@barefootjs/go-template": patch
---

A child-component prop written as a ternary with an `undefined` / `null` alternate (`tag={shown() ? tag() : undefined}`) that the child captures only through its `{...rest}` spread is now delivered: `emitChildField` bakes it as a constructor-time `interface{}` IIFE (`func() interface{} { if <test> { return <consequent> }; return nil }()`), so the server renders `tag="one"` while the branch is taken and no attribute otherwise, as every other adapter does, instead of `tag=""` on every branch. Scoped to rest-bag destinations (a named, concretely typed field keeps its existing lowering). The `child-prop-undefined-alternate-dropped` known-limitation entry and its render-divergence pin are removed; the `child-prop-rest-forward` fixture is the regression test.
