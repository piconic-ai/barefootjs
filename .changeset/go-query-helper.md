---
"@barefootjs/go-template": patch
---

Add the `bf_query` runtime helper (PostList href blocker, #1897 follow-up — Capability C1).

`bf_query(base, ...triples)` builds a URL from a base path plus a query string assembled from `(include bool, key, value)` triples, in order — appending each pair only when its `include` flag is true, with keys/values query-escaped. It mirrors a JS `URLSearchParams` builder whose `.set(key, value)` calls are each guarded by an `if` (the compiler lowers each guard to the `include` bool). This is the runtime primitive the upcoming adapter lowering of `hrefFor`-style helpers emits; no generated output uses it yet.
