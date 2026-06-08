---
"@barefootjs/jsx": minor
"@barefootjs/cli": minor
---

Add `bf debug profile` — reactive performance profiler (#1690), static half.

New CLI subcommand `bf debug profile <component>` prints a per-component static
reactivity budget (no run required): signal/memo/effect/loop counts, total
subscriptions, the longest memo→memo chain, and per-signal fan-out with a `hot`
threshold. `--diff <ref>` compiles the component at a git ref and flags
structural reactivity regressions (CI-able, exits non-zero on growth). Human
table and `--json` output, consistent with the `bf debug *` family.

`@barefootjs/jsx` gains the supporting static-analysis API: `buildStaticBudget`,
`diffStaticBudget`, `formatStaticBudget`, `formatBudgetDiff`, and the
`buildProfileReport` seam for the dynamic (scenario-driven) half specified in
`spec/profiler.md`.
