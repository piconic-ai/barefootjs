---
'@barefootjs/jsx': patch
---

Migrate the client-JS emitter's loop-callback scope tracking onto `BindingScope` (#2482 stage 1b): `html-template.ts`'s CSR materialize template (`opts.loopBoundNames`) and `csr-substitute.ts`'s `csrSubstitute` now thread a `BindingScope` instead of an ad-hoc flat name set, so a `.map()` callback preamble local (#2447) shadowing a same-named module/component constant is no longer const-folded into the CSR-only hydrate template. Also guards `prop-handling.ts`'s `expandDynamicPropValue` / `expandConstantForReactivity` against the same class of bug for per-item reactive attribute effects (`reactivity.ts`'s loop-child collectors and `collect-elements.ts`'s loop-child conditionals) — a loop row binding (item / index / destructured / preamble) that shadows a component const no longer resolves to the outer const's value inside a per-row `createEffect`.
