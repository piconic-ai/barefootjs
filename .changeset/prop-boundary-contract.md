---
"@barefootjs/jsx": patch
"@barefootjs/hono": patch
---

Tightens the boundary between a prop as **data** (must survive the SSR → JSON → CSR hydration round trip) and a prop as a **live binding** (a call-through reference resolved lazily at its own read site), across a four-part design pass:

- BF044 no longer refuses a signal/memo getter passed bare to a component prop (`<Foo x={val} />`) — it already allowed the object-literal-wrapped form (`<Foo x={{ val }} />`), and both are this codebase's deliberate context-provider idiom: the child decides *when* to call the accessor, so it can subscribe at its own read site instead of the value freezing at the parent's render time.
- A destructured `"use client"` prop (`function Foo({ count })`) now reads live, matching the reactivity that props-object mode (`props.count`) already had. Previously the two syntactically equivalent forms diverged silently: destructuring captured the value once at mount and never saw later updates from the parent.
- A function-typed prop a component calls itself (not merely forwards to a child) is now rejected with a pinned, actionable error instead of silently hydrating against `undefined`. JSON can't carry a function, so `bf-p` serialization always dropped it — this makes that boundary loud exactly where dropping it would break the mount, and only there; a pure pass-through function prop keeps working unchanged.
- Elision of a prop across a component boundary (a parent skipping serialization of a prop it only forwards to a child that never reads it) was measured, not built: real corpus census plus a per-prop cost benchmark showed the residual case is already covered by existing elision (only-used props are serialized; children never serialize at all) and not worth the cross-adapter surface it would add. See `spec/compiler.md`'s "Cross-component prop elision" section and the benchmark script it links for the numbers and the reasoning.
