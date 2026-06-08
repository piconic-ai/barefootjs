---
"@barefootjs/client": minor
"@barefootjs/jsx": minor
"@barefootjs/shared": minor
"@barefootjs/cli": patch
---

Add the wasted-re-runs analysis — v1 (#1690, §4.2.2).

A reactive effect/memo that re-ran but produced output identical to its
previous run did removable work — the complement to hot subscribers (where the
cost is, vs. how much of it is removable).

- **Fingerprint (SR1, dev-only/SR8):** new optional `effectOutput(id, changed)`
  sink method on the SR2 stream. The runtime aggregates a per-run output verdict
  via `__bfReportOutput` (flushed once at run exit): memos compare the recomputed
  value by `Object.is`; text bindings (`__bfText`) compare the written string —
  and a stale-element cleanup counts as a real DOM change. A run with no
  fingerprint emits no event and isn't counted. `effectOutput` is optional on the
  exported `ProfilerEventSink`, so a pre-existing custom sink stays valid.
- **Analysis (SR2 + SR4):** `analyzeWastedReReruns` / `formatWastedReReruns`,
  `wasted = wastedRuns / totalRuns`, joined to IR source loc and ranked by
  removable cost then ratio (deterministic). Surfaced in `buildProfileReport` /
  `formatProfileReport` (text + `--json`) behind the new `--wasted-pct` flag
  (default 50%).
