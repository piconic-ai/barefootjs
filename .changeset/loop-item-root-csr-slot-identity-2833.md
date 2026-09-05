---
"@barefootjs/client": patch
"@barefootjs/jsx": patch
---

Fix #2833: a stateful keyed-loop row root rendered via the static-array `single-comp` init path never wired up on a pure CSR mount (no existing SSR markup to hydrate against). `renderChild()` only stamped `(bf-h, bf-m)` slot-identity attributes on a slotted child that DERIVES its scope from the parent slot — a loop item root deliberately does not derive its scope (it owns its own per-row identity, matching Hono), so the CSR template emitters dropped its slot argument entirely, leaving it with no `(bf-h, bf-m)` at all. The static init's `qsaChildScopes` selector, which matches on `(bf-h, bf-m)`, then never found the row, so `initChild` never ran — the row's own signals and event listeners never wired up.

`renderChild` now takes a `loopItemRoot` parameter (#2833): a loop item root still gets `(bf-h, bf-m)` slot identity, matching Hono's `__bfParent`/`__bfMount` stamping, but keeps deriving its own independent scope id rather than the parent's. The two CSR template emit sites now share one decision point, `renderChildScopeArgs` (`packages/jsx/src/adapters/child-scope.ts`), so they can't drift the way `derivesScopeFromSlot` itself once did (#2444). A static loop's materialize `forEach` (which runs during `init`, after the parent's own template evaluation and its ambient parent-scope id have already unwound) now re-establishes that id via a new `withParentScope()` runtime helper for the duration of the row's template evaluation, so its `bf-h` matches the same `__scopeId` the static init's own selector interpolates.
