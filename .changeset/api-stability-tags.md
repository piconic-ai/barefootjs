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
Tag every public export of the documented surfaces with `@since` / `@stability` / `@example` JSDoc tags (or `@internal`), the source of the new generated API reference (`docs/core/advanced/api-reference.md`, `scripts/generate-api-reference.ts`) — which now renders one linkable `###` section per API with its example, rather than a summary table. `@barefootjs/jsx` additionally exports the compiler's two directive spellings as constants (`USE_CLIENT_DIRECTIVE`, `CLIENT_EXPRESSION_DIRECTIVE`) from a new `directives.ts` that every detection site now reads instead of repeating the literal. Comments and docs only — no behavior change.
