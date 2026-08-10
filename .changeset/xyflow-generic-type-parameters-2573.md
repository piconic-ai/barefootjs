---
"@barefootjs/jsx": patch
"@barefootjs/hono": patch
---

Fix a type-level emission defect surfaced by the `ui/` corpus type-check gate (#2573): a generic component function's own type parameters (`function Flow<NodeType, EdgeType>(...)`) were dropped from the emitted `.tsx` SSR template. The function came out as `function Flow(...)` even though its props type annotation — and often its body — kept referencing the type parameter names verbatim (`props: FlowComponentProps<NodeType, EdgeType>`, `createFlowStore<NodeType, EdgeType>(props)`), so `tsc` reported `TS2304` ("Cannot find name 'NodeType'") at every such reference.

`IRMetadata.typeParameters` now carries the source's type parameter list verbatim (per-parameter `node.getText()`, mirroring `ConstantInfo.typeAnnotation`'s #2589 precedent), and `HonoAdapter`/`TestAdapter` splice it between the function name and the parameter list. Type-only — no change to rendered output or runtime behavior. Non-generic components (the overwhelming majority) are unaffected.

Ratchets the `corpus-typecheck.test.ts` allowlist: `xyflow TS2304` (7) drops to zero.
