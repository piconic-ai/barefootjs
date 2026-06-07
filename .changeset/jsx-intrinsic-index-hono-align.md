---
"@barefootjs/jsx": patch
---

Fix the `@barefootjs/hono` JSR publish, which failed with 31 `TS2411`
errors in `jsx-runtime/index.d.ts`. The `IntrinsicElements` catch-all
`[tagName: string]: HTMLBaseAttributes` forced every explicitly-typed
element to be assignable to `HTMLBaseAttributes`, which TypeScript rejects
because the per-element types narrow `ref` to a concrete subtype and
re-declare event handlers (not assignable under `strictFunctionTypes`).
`tsc` hid this with `skipLibCheck`, but `deno publish` always type-checks
`.d.ts`. Switch the index signature to `Record<string, any>`, mirroring
hono/jsx (`[tagName: string]: Props`, `Props = Record<string, any>`).
Explicitly-typed elements are unaffected; the index only governs unlisted
tag names.
