---
"@barefootjs/jsx": patch
"@barefootjs/client": patch
"@barefootjs/shared": patch
"@barefootjs/vite": patch
"@barefootjs/hono": patch
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/twig": patch
"@barefootjs/blade": patch
"@barefootjs/rust": patch
---
Tag every public export of the documented surfaces with `@since` / `@stability` / `@example` JSDoc tags (or `@internal`), the source of the new generated API reference (`docs/core/advanced/api-reference.md`, `scripts/generate-api-reference.ts`) — one linkable section per API with its example.

The `beta` tier is scoped to what a component author actually writes, measured against authored call sites in `ui/` / `site/` / `integrations/`: `@barefootjs/client`'s `provideContext`, `forwardProps` and `unwrap` are compiler ABI (emitted from `@barefootjs/client/runtime`, zero authored imports) and are now `@internal`; `createRoot`, `createSelector` and `splitProps` are `alpha`; the three portal helpers `isSSRPortal`, `findSiblingSlot` and `cleanupPortalPlaceholder` are `beta`, since `createPortal` is unusable in an SSR app without the first and the other two have authored call sites in six `ui/` components and a docs page respectively. No export was added or removed.

The reference also covers the two APIs an app calls itself on the browser-only `@barefootjs/client/runtime` entry — `render` (CSR) and `setupStreaming` — which are now tagged `beta`. They stay on that entry rather than moving to `@barefootjs/client`, whose root must remain safe to import from a server bundle.

`@barefootjs/jsx` additionally exports the compiler's two directive spellings as constants (`USE_CLIENT_DIRECTIVE`, `CLIENT_EXPRESSION_DIRECTIVE`) from a new `directives.ts` that every detection site now reads instead of repeating the literal. Comments and docs only — no behavior change.
