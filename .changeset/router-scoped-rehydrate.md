---
"@barefootjs/router": minor
---

Use the client runtime's subtree-scoped seams. The default `rehydrate` now re-hydrates just the swapped outlet via `window.__bf_hydrate_within` (O(outlet), not O(document)), and the default `dispose` releases the outgoing islands precisely via `window.__bf_dispose_within` — fixing the leak where a left page's timers/listeners kept running. `rehydrate` now receives the outlet element. Both gracefully fall back when the client runtime predates these seams.
