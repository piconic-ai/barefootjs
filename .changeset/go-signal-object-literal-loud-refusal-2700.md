---
"@barefootjs/go-template": patch
---

Fix #2700: a `derived`-classified signal seeded from an object literal that references a live prop/signal (`createSignal({ ...base, done: true })`) silently kept the field's Go zero value in the SSR template whenever the constructor-time baker (`convertInitialValue`) couldn't reproduce it — that baker is static-only (identifier/member/call operands defer, `parsed-literal-to-go.ts`'s own docstring), so `merged().id` / `merged().done` reads on real Go always saw the zero value with no diagnostic at all.

The adapter now refuses this shape loudly with `BF101` instead: `rootFieldRef` (the single door every SSR template read of a root-scope field passes through) records which fields the template actually reads, and `generateNewPropsFunction`'s signal loop consults that record — after `generate()` has rendered the template — to fire only when the deferred bake is ACTUALLY read (a signal that only feeds a JSX spread bag, which bakes through its own `.Spread_<slot>` route, is unaffected) and only for a `derived` step with a non-empty free set (a fully-static object literal is a separate, untracked silent-divergence shape left for its own issue, not silently widened into this fix). A verified-working `/* @client */` escape twin (`signal-object-spread-init-client`) exists, so the refusal is `/* @client */`-escapable per policy.

No memo-side counterpart: the analyzer deliberately never attaches a structured `parsed` tree to an object-returning memo body, so there's no structural handle to reach this check for a memo without re-parsing source text, which the repo's own conventions rule out — #2700's own reproduction and fixture are signal-only.

Reclassifies #2700 from `bug` to `enhancement` (the divergence is now a loud, escapable refusal rather than a silent wrong render) and graduates the `signal-object-spread-init` render-divergence pin.
