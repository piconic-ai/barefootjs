---
"@barefootjs/router": patch
---

Prefetch is now best-effort like Next.js: a failed prefetch is no longer cached, so it can't poison the URL. The cache entry is evicted when a load resolves to a failure, so the next prefetch or the click retries fresh (a click whose load ultimately fails still falls back to a full navigation). Successful loads stay cached (TTL'd).
