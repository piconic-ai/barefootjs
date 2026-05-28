---
"@barefootjs/cli": patch
---

externals: stop the false-positive "not browser-ready" warning for chunks whose only un-resolved imports are the always-importmap-resolved `@barefootjs/client*` dedup keys, and make `rebundle: true` pass those peers (and other configured externals) as `external` to esbuild so the shared reactive runtime is no longer inlined into the chunk (#1646).
