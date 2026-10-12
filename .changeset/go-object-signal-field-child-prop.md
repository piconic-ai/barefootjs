---
'@barefootjs/go-template': patch
---

A child prop bound to an object signal's field (`<Child name={u().name!} age={u().age!} />`) now receives the field's SSR value instead of being left out of the child's Input. A child prop value inside the evaluator's surface is computed by `bf.EvalExpr` over the parent's seeds and converted to the child field's Go type, which unboxes a field typed `interface{}` for a concrete child prop. The same conversion now gives an `int`-typed memo its evaluated value.
