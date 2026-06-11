---
"@barefootjs/hono": patch
---

`test-render` re-anchors imports *inside* pre-compiled child modules too: a `componentModules` child that itself imports another pre-compiled sibling (e.g. a demo root's `accordion` sibling importing `../icon`) previously kept its source specifier in the temp copy and failed module resolution at render time.
