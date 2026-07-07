---
"@barefootjs/jsx": patch
---

Resolve declared types for required primitive destructured props. `{ value }: { value: number }` now carries its `number` type through the IR instead of degrading to `unknown`, so typed adapters (Go) emit a concrete field (`Value int`) rather than `interface{}` plus an unchecked scalar assertion (`in.Value.(int)`) that could panic on a non-int caller. Scope is deliberately narrow — only required primitive members resolve; optional members and arrays/objects stay `unknown` to preserve existing attribute-omission and interface{}-based lowering. Fixes #2150.
