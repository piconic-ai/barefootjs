---
"@barefootjs/go-template": patch
---

Continue decomposing the Go html/template adapter (Phase 4). Internal-only, output byte-identical (verified by the adapter unit + conformance suites); no behavioural or public-API change.

- `analysis/component-tree.ts` — pure IR structural walks (`hasClientInteractivity`, nested/child-component discovery) moved out as free functions that read no adapter state.
- `emit-context.ts` — introduce `GoEmitContext`, the narrow interface (per-compile `state` + the recursive entry points) that extracted emit modules depend on instead of the concrete adapter. The adapter implements it and passes `this`.
- `expr/helper-inline.ts` — local arrow-const helper inlining at a call site.
- `expr/url-builder.ts` — `URLSearchParams` builder helpers → `bf_query` lowering.
