---
"@barefootjs/go-template": patch
---

Extract the Go html/template adapter's value-lowering cluster into `value/value-lowering.ts` (Roadmap B). Internal-only, output byte-identical (verified by the adapter unit + conformance suites); no behavioural or public-API change.

- `value/value-lowering.ts` — `convertInitialValue`, `jsLiteralToGo`, `objectLiteralToGoMap`, `tsLiteralToGo`, `getSignalInitialValueAsGo` moved out as pure free functions over `GoEmitContext`. They bake inline signal/const initial values into Go literals (scalars, prop references, fully-literal arrays/objects) and fall back to `nil`/`0` otherwise.
- `emit-context.ts` — `GoEmitContext` gains `typeInfoToGo` and `extractPropNameFromInitialValue`, the two adapter entry points the moved functions call back into (`parseLiteralExpression` was already on the seam). `typeInfoToGo` / `parseLiteralExpression` stay on the adapter as widely-shared members.
