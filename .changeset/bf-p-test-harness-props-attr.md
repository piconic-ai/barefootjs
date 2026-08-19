---
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/go-template": patch
---

Fixed the conformance test harnesses (`test-render.ts`) so every adapter now actually exercises `props_attr`'s `bf-p` hydration-props contract during SSR rendering, matching production's `Renderer.renderComponentInto` (Go) / `_props` accessor (ERB, Jinja, Mojolicious): previously none of these harnesses seeded the caller-facing props the way a real route handler does, so `bf-p` was silently absent from every rendered fixture regardless of what the adapter itself emitted. No adapter runtime behavior changed — only the harness code used by the test suite.
