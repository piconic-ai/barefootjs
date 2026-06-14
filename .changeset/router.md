---
"@barefootjs/router": minor
"@barefootjs/shared": minor
---

Add `@barefootjs/router`: an automatic partial-navigation client router that swaps only the `[bf-outlet]` content region on same-origin link navigation and re-hydrates the islands inside it, leaving the page shell mounted. Backend-agnostic — it fetches the full page and extracts the outlet client-side; no content-negotiation header.

Includes:
- **Outlet-scoped swap** reusing the client runtime's subtree-scoped re-hydration (`window.__bf_hydrate_within`) and precise per-scope disposal (`window.__bf_dispose_within`).
- **Module-aware swap**: loads a navigated-to island's JS (the response's `<script type="module">`) before re-hydrating, so an island whose module wasn't on the first page comes alive.
- **Last-wins navigation**: rapid clicks resolve to the latest target (abort guard).
- **Prefetch** on hover (dwell), focus, and primary press (`pointerdown`), with `modulepreload` of island modules. Best-effort like Next.js (failed prefetches aren't cached).
- **Snapshot cache**: stale-while-revalidate with a jittered refresh window and LRU eviction (`cacheFreshMs` / `cacheStaleMs`), making back/forward instant.
- **`searchParams()`** (`@barefootjs/router/signals`): a reactive read of the URL query, branded `Reactive<…>` so the existing compiler reactivity analysis drives fine-grained island updates. A same-route query-only navigation updates the signal + URL without swapping the outlet (a pathname change still swaps).

Adds `BF_OUTLET` to `@barefootjs/shared` (the swappable-region marker).
