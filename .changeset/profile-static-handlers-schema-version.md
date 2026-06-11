---
"@barefootjs/jsx": minor
---

feat(profile): expose handlers in the static budget + `schemaVersion` on every JSON mode (#1841)

The static reactivity budget exposed signal/memo/effect counts and fan-out, but
**not the handlers `--scenario auto` would fire** — so an agent couldn't see
"what gets fired" or "which handlers are uncovered" without an actual run. The
remaining coverage gap (e.g. `coverage: 1/5 handlers exercised`) named a count
but never the handler names or locations.

`StaticBudget` now carries a `handlers` array — `{ name: "click@s1", loc: { file,
line } }` — built from the same `graph.domBindings` event slots the auto scenario
fires, so the static list and the dynamic coverage share one identity (the
slotId). The text output gains an optional `handlers (N):` section when handlers
exist. This lets an agent predict the coverage gap and reference handler names
before any run.

All three `bf debug profile --json` modes (`static-budget` / `profile` / `diff`)
now include a top-level `schemaVersion` (exported as `PROFILE_SCHEMA_VERSION`) so
a machine consumer can branch on the output contract; the same major version is
additive-only.
