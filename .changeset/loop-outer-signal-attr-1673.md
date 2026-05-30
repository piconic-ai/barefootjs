---
"@barefootjs/jsx": patch
---

Per-item attribute reading an outer signal by index now becomes reactive inside `.map()` (#1673).

A per-item attribute/style expression inside a keyed `.map()` only got a `createEffect` when it read the loop item accessor (`it.w`) or a directly-named signal/memo/prop. If it instead read the source array signal through a helper indexed by position — e.g. `style={`width:${widthAt(i)}%`}` where `const widthAt = (i) => items()[i].w` — the compiler emitted no reactive effect and the value froze at its server-rendered value after hydration. The identical binding on a top-level element updated correctly.

`collectLoopChildReactiveAttrs` now applies the same Solid-style wrap-by-default AST-flag fallback (`callsReactiveGetters` / `hasFunctionCalls`) that the top-level attribute path (`decideWrapForAttr`, #940) already used. An opaque function call inside a per-item attribute is wrapped in a per-item `createEffect`, so it tracks whatever signals it reads at runtime and reflects current state after hydration — matching the equivalent top-level binding. The emitted effect resolves the loop index reference to the renderItem index variable, so the closure stays valid.
