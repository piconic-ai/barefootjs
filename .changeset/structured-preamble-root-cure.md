---
"@barefootjs/jsx": patch
"@barefootjs/hono": patch
---

Root-cure the `.map()` callback-preamble pipeline (Stage 3 of `spec/callback-fidelity.md`).

The preamble was carried as sentinel-bearing strings (`mapPreamble` + `__BF_JSX_N__` placeholders) whose substitution obligations were spread across every loop emitter — each unwired emitter silently leaked raw JSX or sentinels into the client bundle. Probing found five such silent holes (bare-identifier return, multi-root fragment return, ternary return after a builder preamble, nested inner map, conditional-branch loop). The carrier is now a structured type: `MapCallbackPreamble` segments (JS text / compiled JSX-leaf IR) plus `TsxSourceText`-branded raw TSX for JSX-runtime SSR, rendered exclusively through `renderPreamble()` — a consumer that can't call it cannot splice the preamble, so a missing wire-up is a type error, not a runtime leak. The migration itself healed the multi-root, nested-inner-map, and branch-loop holes (nested verified to full parity); an executable trichotomy harness (`map-body-no-silent-divergence.test.ts`) pins every body shape as either sound-or-loud, with the remaining acceptance holes tracked in a shrink-only set closed later in this series. A JSX leaf inside a template literal in a preamble is now refused explicitly.
