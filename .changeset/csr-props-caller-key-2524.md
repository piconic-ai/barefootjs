---
"@barefootjs/jsx": patch
"@barefootjs/hono": patch
---

`_p` props-object keys are now uniformly the caller-facing property name (`sourceName ?? name`)

Fixes aliased destructured props rendering empty on the CSR/hydration path
(#2524 CSR half). A renaming destructure (`{ n: count }`) previously
compiled to client JS reading `_p.count` — the LOCAL binding — while the
caller always passes `n`, so the local binding hydrated to `undefined`
and the corresponding slot rendered empty.

Every `_p` producer and consumer is now keyed by the caller-facing name:
the SSR `bf-p` hydration blob (Hono adapter), the generated `initXxx`
props-extraction, the CSR `template:` lambda, controlled-signal sync,
rest-spread exclude keys, and the `relocate()` prop-lift path. `sourceName
?? name` is an identity for un-aliased props, so every existing snapshot
and fixture stays byte-identical — this is a rename-only fix.
