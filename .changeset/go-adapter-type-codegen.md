---
"@barefootjs/go-template": patch
---

Extract the Go html/template adapter's type codegen into `type/type-codegen.ts` (Roadmap B). Internal-only, output byte-identical (verified by the adapter unit + conformance suites); no behavioural or public-API change.

- `type/type-codegen.ts` — `typeInfoToGo`, `tsTypeStringToGo`, `inferTypeFromValue` moved out as pure free functions. They render a prop/signal/const's TypeScript type (`TypeInfo`, a raw type string, or an inferred shape from a literal) into the Go struct-field type, reading only `state.localTypeNames`.
- `emit-context.ts` — `typeInfoToGo` is removed from `GoEmitContext`: now a free function, `value-lowering` imports it directly instead of calling back through the seam, shrinking the context surface.
