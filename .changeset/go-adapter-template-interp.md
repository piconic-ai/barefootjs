---
"@barefootjs/go-template": patch
---

Extract the Go html/template adapter's template-literal memo lowering into `memo/template-interp.ts` (Roadmap B). Internal-only, output byte-identical (verified by the adapter unit + conformance suites); no behavioural or public-API change.

- `memo/template-interp.ts` — `computeTemplateLiteralMemoInitialValue`, `resolveTemplateInterpolation`, `parseLocalKeyBinding`, `recordIndexInterpolationToGo`, `propsAccessName` moved out as pure free functions. They compute a template-literal memo's SSR initial value as a Go `string` expression (quasis → Go literals; `${…}` interpolations → module string consts / `Record`-index maps / `props.<name>` field reads), reading only `state.localConstants` / `state.propsObjectName` / `state.usesFmt`.
- `emit-context.ts` — `GoEmitContext` gains `resolveModuleStringConst`, the one adapter-resident entry point this module calls back into (it depends on per-compile loop state that stays on the adapter).
