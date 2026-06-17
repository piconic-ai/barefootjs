---
"@barefootjs/router": minor
---

New package `@barefootjs/router` — a backend-agnostic, progressively-enhanced partial-navigation router (spec/router.md **v0**). `startRouter()` intercepts same-origin navigations, fetches the ordinary full-page HTML any backend already returns (no protocol header), and swaps only the `[bf-region]` subtree — disposing and re-hydrating just the islands inside it while the shell stays mounted.

- **Correct by default.** The client runtime is an optional peer; a static shell ships zero of it. When islands are present, `dispose`/`rehydrate` degrade through the same fallback chain (`window.__bf_*` seams → `@barefootjs/client/runtime`'s `disposeScope`/`rehydrateScope`) and never silently no-op — no opt-in setup step.
- **Resilient navigation.** Last-wins across overlapping navigations; an SWR + LRU snapshot cache (promise-based, so a prefetch and click share one request; aging entries serve instantly and revalidate in the background; failures aren't cached); module-aware import-before-hydrate, deduped across navigations; redirect-aware history commits; `history.state` preserved on replace.
- **Prefetch** on hover (dwell) / focus / pointerdown with `<link rel=modulepreload>`.
- **Accessibility on swap**: focus moves into the new region (its first heading) and the route is announced via a polite live region.

Scope is the v0 floor — a single authored region (the broadest `[bf-region]` match), "never worse than an MPA". `searchParams()` (v0.5) and compiler-derived nested regions (v2) build on this.
