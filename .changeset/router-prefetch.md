---
"@barefootjs/router": minor
---

Hover prefetch + snapshot cache. On hover (after a short dwell), focus, or touchstart the router prefetches a link's page into an in-memory cache and `modulepreload`s its island modules (fetch + compile, not execute); the click then reuses the cached page with no network wait and `import()`s the preloaded modules. The cache (TTL'd, bounded) also makes back/forward instant. Navigations now route through this cache, so a concurrent prefetch + click share one request. Opt out with `startRouter({ prefetch: false })`; tune the dwell with `prefetchDelay`. Adds a `prefetch(url)` method to the returned router.
