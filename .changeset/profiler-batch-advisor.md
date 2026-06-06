---
"@barefootjs/jsx": minor
---

Add the batch-advisor analysis — measured half (#1690, §4.2.3).

`analyzeBatchAdvisor(events)` groups the SR2 stream by turn and, per turn,
measures effect `totalRuns` vs `distinctSubscribers`; `savings = totalRuns −
distinctSubscribers` is the runs a `batch()` wrap would collapse. Turns with
`savings > 0` are reported, ranked by savings. This is the cost BarefootJS's
explicit-batching model uniquely incurs (`set()` notifies synchronously).

Measured half only: every candidate is `safety: 'unverified'`. The static
post-write-derived-read oracle that proves a `batch()` wrap is behavior-
preserving (and the handler-loc join for the finding's source location) lands
in a follow-up (#1790) — an advisory that could change behavior is never
labeled `'safe'` (§4.2.3). `formatBatchAdvisor` renders the report.
