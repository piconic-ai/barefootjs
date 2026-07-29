---
"@barefootjs/client": minor
"@barefootjs/jsx": minor
---

Connect a CSR-materialised child component before running its `init`, so
context resolves by DOM position.

**This changes when `init` runs relative to DOM insertion.** `createComponent`
built the element with `parseHTML(...).firstChild` and called `initFn` on it
while it was still detached; every caller then attached it afterwards
(`ph.replaceWith(comp)`). So a component's own `init` observed an element with
no parent chain.

`useContext` resolves providers by walking `parentElement` from the current
scope. From a detached element that walk finds nothing and falls through to
the module-global fallback store in `runtime/context.ts` — and that store is
**last-writer-wins across every provider of the same context on the page**.
With one provider the fallback happens to return the right value, which is why
this stayed hidden.

The divergence shows up when a child is materialised *after* a sibling provider
has run. During a plain hydration pass the doc-order walker inits each provider
immediately before creating its own children, so the global still holds that
provider's value. But a child created later — by an interaction — reads whatever
provider hydrated last:

```
<Host value="ONE">   ← child added here, later
<Host value="TWO">   ← this one wrote the global last
```

the new child under `ONE` received `"TWO"`.

`createComponent` now takes a `mountAt` argument — the placeholder it replaces —
and performs that replacement *before* `init`, so `useContext` resolves by
position and layout reads (`offsetWidth`, `getBoundingClientRect`) see a
laid-out element. `upsertChild`, `upsertChildItem`, and the branch
child-component emission pass their placeholder through. This aligns the CSR
path with the SSR one, where the doc-order walker only ever inits elements
already in the document (see `runtime/hydrate.ts`, whose ordering contract
exists for exactly this `provideContext` → `useContext` visibility reason).

`mountAt` is an unconditional obligation, since callers previously ran
`replaceWith` on every outcome: paths that don't consume it — a missing or empty
template, and the root-deferred-placeholder shape that must stay detached so its
self-replacement stays recoverable — still get the replacement performed on the
way out.

Both construction modes honour it. `ComponentDef` mode initially did not: that
branch returned early and ran `def.init` detached, so `createComponent(def, …,
mountAt)` kept the very bug this fixes. `mountAt` is threaded through it too, so
the lifecycle does not depend on whether a caller passes a name or a def.

**Still open:** `mapArray` rows are unaffected and continue to init detached —
`renderItem` returns the element to `mapArray`, so there is no placeholder to
hand over, and the batched `insertBefore` happens later. This is the xyflow
shape (`<Flow>` provides `FlowContext`; nodes render through `mapArray` and read
`useFlow()` in their init), and the reason
`packages/xyflow/src/flow-subsystems.ts` carries a `__bfFlowStore` +
`closest('.bf-flow')` workaround. Reproduced by the skipped tests in
`packages/client/__tests__/runtime/csr-loop-row-init-connected.test.ts`; closing
it reorders the emitted `renderItem` tail or pre-inserts the row, both on the
runtime's hottest path, so it is deliberately not bundled here.
