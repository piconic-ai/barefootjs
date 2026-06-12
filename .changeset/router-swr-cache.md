---
"@barefootjs/router": minor
---

Snapshot cache upgrade: stale-while-revalidate with a jittered refresh window and LRU eviction. Each cached page now has three states — fresh (served as-is), aging (served instantly *and* refreshed in the background for next time, single-flight per URL), and stale (too old to serve → refetched fresh). The refresh threshold is jittered per entry (±30%) so a batch of prefetches doesn't all revalidate at once. The size cap now evicts least-recently-used (a cache hit re-inserts) instead of oldest-by-insertion, so a page you bounce back to via back/forward isn't dropped. Tunable via `cacheFreshMs` (default 15000) and `cacheStaleMs` (default 60000).
