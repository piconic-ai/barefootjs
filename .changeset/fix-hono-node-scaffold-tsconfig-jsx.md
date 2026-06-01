---
"@barefootjs/cli": patch
---

Fix the Hono (Node) scaffold's `tsconfig.json` excluding `dist/components`, where `bf build` writes the compiled SSR templates the server imports via the `@/components/*` path mapping. `tsx` applies the JSX transform per-file and honours tsconfig `include`/`exclude`, so an excluded `.tsx` lost `jsxImportSource: "@barefootjs/hono/jsx"` and fell back to the classic React runtime — the first SSR render threw `ReferenceError: React is not defined` and every page 500'd. The compiled templates now stay in transform scope. The Cloudflare/wrangler `hono` scaffold is unaffected (wrangler's esbuild applies the JSX option globally during bundling).
