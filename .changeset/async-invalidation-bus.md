---
"@barefootjs/shared": minor
"@barefootjs/router": patch
---

Add the async layer 0 invalidation bus (`spec/async.md` §7.4): `invalidate(prefixes)` and `onInvalidate(listener)` from `@barefootjs/shared`. The listener set lives on `globalThis` under a `Symbol.for` key, so separately bundled copies of the package share one bus. A running router now evicts its whole page cache on any invalidation, and a background refresh that started before the invalidation no longer writes its snapshot back.
