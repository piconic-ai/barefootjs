---
"@barefootjs/jsx": patch
---

Fix the `@barefootjs/hono` JSR publish, which failed with 31 `TS2411`
errors in `jsx-runtime/index.d.ts`. The `IntrinsicElements` catch-all
`[tagName: string]: HTMLBaseAttributes` is incompatible with the
explicitly-typed elements under TS's index-signature rule, because the
per-element types intentionally narrow `ref` to a concrete subtype and
re-declare event handlers (not assignable under `strictFunctionTypes`).
The diagnostic is spurious for JSX — a tag name always resolves to its
explicit entry, never the index signature. `tsc` never surfaced it
(`skipLibCheck`), but `deno publish` always type-checks `.d.ts`.

Suppress the self-check of this one declarative shim with `@ts-nocheck`
instead of widening the catch-all to `Record<string, any>`. Widening
would silently drop attribute checking for custom / web-component tags;
`@ts-nocheck` keeps the types fully strict at every use site (it only
disables errors *within* the shim file) while letting the publish through.
