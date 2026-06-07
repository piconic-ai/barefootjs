---
"@barefootjs/jsx": patch
---

Make the `./jsx-runtime` and `./jsx-dev-runtime` type entries JSR-publishable
so `@barefootjs/hono` can publish to JSR. They were `.d.ts` files, which JSR
drops from a package's exports (JSR can't use a `.d.ts` as an export
entrypoint). As a result `@barefootjs/jsx/jsx-runtime` did not exist on JSR,
and `@barefootjs/hono`'s JSR publish failed at the documentation-generation
step with `Failed resolving '@barefootjs/jsx/jsx-runtime'` (it resolved
locally only via `node_modules`, which JSR's server doesn't have).

Convert both shims from `.d.ts` to real `.ts` modules (ambient `export
declare` declarations — same type surface, no runtime added) so JSR publishes
them as exports. The `jsx-dev-runtime` re-export becomes
`import type { JSX } … ` + `export type { JSX }` to satisfy isolatedModules
(TS1205) now that it is a real module. Types are unchanged — the
`IntrinsicElements` catch-all stays `HTMLBaseAttributes` with the existing
`@ts-nocheck`, so consumer type strength is preserved.
