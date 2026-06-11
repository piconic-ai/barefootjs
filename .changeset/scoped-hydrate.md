---
"@barefootjs/client": minor
---

Add subtree-scoped re-hydration and precise per-scope disposal to the runtime.

- `rehydrateScope(root)` runs a synchronous hydration walk over just `root`'s subtree (cost O(scopes in `root`)), beside the existing whole-document `rehydrateAll()`. Lets a caller that knows which region changed — a client router after a content swap, a streaming chunk, a conditional/loop that just inserted a branch — hydrate only that region instead of re-walking the document.
- `disposeScope(root)` tears down the reactive graphs (effects, memos, `onCleanup`) of every scope inside `root`. Each scope's `init` now runs inside a `createRoot` so its bindings have a disposable owner. This is additive: nothing disposes a root unless `disposeScope` is called, so existing component lifetimes are unchanged.
- Both are exposed on `window` via `setupStreaming` as `__bf_hydrate_within` / `__bf_dispose_within`.
