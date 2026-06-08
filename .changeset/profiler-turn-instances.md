---
"@barefootjs/shared": minor
"@barefootjs/client": minor
"@barefootjs/jsx": patch
---

Count turn *invocations*, not handler ids, in profiler metrics (#1690).

Dogfooding a list whose rows share one `onClick` revealed that firing the same
handler N times (clicking N rows) collapsed into a single "turn" — because
events were keyed by the handler-id string. That inflated `runsPerTurn` and
batch-advisor savings (N interactions summed into one turn).

`ProfilerEvent` now carries `turnSeq` (a unique per-invocation counter the
recording sink stamps at each `beginTurn`). The analyses count distinct turns by
`turnSeq`: hot-subscribers `runsPerTurn` divides by real invocations, the batch
advisor evaluates each invocation separately (reporting the worst per handler),
and `report.turns` reflects interactions while `coverage.handlersFired` still
counts distinct handlers. A 3-row list now reads `turns: 3, handlers: 1/1`
(was `turns: 1`).
