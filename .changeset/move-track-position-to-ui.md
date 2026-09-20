---
"@barefootjs/client": minor
"@barefootjs/jsx": patch
"@barefootjs/hono": patch
---

Removed `trackPosition` (Alpha) from `@barefootjs/client`. It was floating-UI plumbing used only by `ui/` overlay components — it moved to `ui/lib/track-position.ts` as an internal helper (no longer a public runtime API, so its stability tag is dropped). If you called it directly, copy its implementation (it is a small, dependency-free function) or vendor `ui/lib/track-position.ts`.

`@barefootjs/jsx`'s analyzer no longer recognises `trackPosition` as a known runtime import or a browser-only API imported from `@barefootjs/client`.

`@barefootjs/hono`'s client shim no longer stubs `trackPosition`.
