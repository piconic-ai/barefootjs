---
'@barefootjs/go-template': patch
---

A memo computed from an object signal's field (`createMemo(() => u().name ?? 'x')`, `(u().age ?? 0) + 1`, `u().name!.toUpperCase()`) now bakes its SSR value. The constructor matched memo bodies against a fixed set of shapes and baked `nil` for any other; a body inside the evaluator's surface is now computed by `bf.EvalExpr` over the seeds of the signals, memos and props it reads.
