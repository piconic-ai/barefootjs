---
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

Fix the conformance test harness (`test-render.ts`, `conformance-pins.ts`, `render-divergences.ts`) to pass `siblingTemplatesRegistered: true` when rendering fixtures with sibling components, matching `bf build`'s real semantics. This was a test-only gap — no adapter runtime or codegen behavior changes — that spuriously refused `static-array-children`, `todo-app`, and `todo-app-ssr` with `BF103` in the conformance suite even though the shape works in real usage (#2205).
