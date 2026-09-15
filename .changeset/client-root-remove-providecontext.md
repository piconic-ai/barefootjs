---
"@barefootjs/client": minor
---

**Breaking:** remove `provideContext` from `@barefootjs/client`'s root export. It was tagged `@internal` in the prior release (#3008) but still physically re-exported from the package root; this finishes that narrowing.

`provideContext` is DOM-only — a component author writes `<Ctx.Provider value={…}>`, which the compiler lowers to a `provideContext()` call in client JS only, and the SSR path gets its own bridge (e.g. `@barefootjs/hono`'s `provideContextSSR`) instead of calling this function at all. Nobody imports it directly (91 `.Provider` uses across `ui/`, `site/` and `integrations/`, zero direct imports). It remains available from `@barefootjs/client/runtime`, where the compiler's CSR-rewritten imports already resolve it.

`forwardProps` and `unwrap` stay on the root, unlike `provideContext`: both are pure (no DOM), so `@barefootjs/client`'s SSR-safe root re-exports them for the compiler's SSR-rewritten imports too (`@barefootjs/hono`'s `client-shim.ts` imports both straight from the root). Only `provideContext` moves off.
