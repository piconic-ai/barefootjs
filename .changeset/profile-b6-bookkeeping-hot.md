---
"@barefootjs/jsx": patch
---

fix(profile): label & locate uninstrumented `createEffect` in the hot table (#1849 B6)

A `createEffect` nested in a ref callback (accordion/collapsible/sidebar/tabs/toast) gets no compiler `__bfId`, so the runtime assigns a fallback id like `e1` that surfaced as a bare `(unresolved)` hot row — reading like a broken profiler.

The row is now kept (its cost is real, not hidden) and:
- relabelled `(uninstrumented — createEffect in non-JSX scope)` so the missing location is understood as expected;
- annotated with candidate source lines from a static scan (`createEffect` call sites minus the compiler-instrumented ones), e.g. `candidates: collapsible/index.tsx:82, :126, :184`.

JSON gains `resolution: "uninstrumented"`, `resolutionNote`, and `candidates: [{ file, line }]` on those subscribers. New exports: `findUninstrumentedEffects`, `EffectCandidate`.
