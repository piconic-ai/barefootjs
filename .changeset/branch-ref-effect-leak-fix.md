---
"@barefootjs/client": patch
---

Fixes an effect leak (#2927): `createEffect()` called from a `ref` callback inside a conditional branch (`cond ? <A ref={...}/> : <B/>`) used to leak one effect per re-entry into that branch. `createEffect()` returns `void`, so the compiler-emitted `bindEvents` for a branch whose only reactive content is a `ref` callback has nothing to return, and `insert()`'s `branchCleanup` mechanism never ran — the effect kept firing forever even after its host element was unmounted. `insert()` now runs each branch's `bindEvents()` inside its own `createRoot()`, the same per-scope ownership mechanism `mapArray()` already gives each loop row, so disposing that root on the next branch switch cleans up whatever reactive primitives `bindEvents()` created, whether or not the compiler could enumerate them.
