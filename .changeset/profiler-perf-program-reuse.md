---
"@barefootjs/jsx": patch
---

Reuse the TS program across components when profiling multi-component files (#1690).

Dogfooding timing surfaced that a profile of a file declaring many components
(e.g. `chart`, ~25) took ~30s, because `buildProfileReport` re-built a fresh
TypeScript program (the dominant cost) for every component. It now builds the
program once per source via `createProgramForFile` and threads it through
`buildComponentAnalysis` / `buildEventSummary` — `chart` drops 30s → ~2.9s.
`buildStaticBudget` likewise shares one program between its graph + summary
passes. The per-file analysis functions gain an optional `program` parameter.
