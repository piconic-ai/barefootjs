---
"@barefootjs/jsx": patch
---

Refine the hot-subscribers per-turn metric and add end-to-end profiling proof
(#1690).

Running the full substrate end-to-end (real `reactive.ts` instrumentation +
`createRecordingSink` + SR4 join + analyses) surfaced that `runsPerTurn`
conflated the one-time mount run (`turn=null`) with interaction turns — an
effect a click re-runs 5× read as a diluted `3.0`. Hot subscribers now split
`mountRuns` out and compute `runsPerTurn = (runs − mountRuns) / interactionTurns`,
matching the batch advisor's mount-excluding turn handling, and the report
shows each subscriber's `kind` (memo vs effect).

Adds `profiler-e2e.test.ts`: drives a mirrored Cart graph (exact compiler ids)
through the live runtime and asserts the joined story — an unbatched 3-write
click re-runs `total` 5×/turn; a `batch()` collapses 14 effect runs to 5.
