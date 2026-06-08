---
"@barefootjs/jsx": minor
---

Add the hot-subscribers analysis (#1690, §4.2.1) — the first v1 profiler insight.

`analyzeHotSubscribers(events, index, options)` consumes the SR2 event stream
and the SR4 id index and ranks effects/memos by total run time, each joined to
its IR source loc:

- `runs` (`effectEnter` count), `totalMs` (Σ `effectExit.dur`),
- `runsPerTurn` — average runs per active turn, the re-run-pressure signal that
  flags batch / over-subscription candidates,
- `hot` when `runsPerTurn` meets a configurable threshold (default 2),
- `topN` to keep only the costliest.

Pure and deterministic: the same stream yields the same ranking (timings vary,
ranks/structure do not). Unresolved subscriber ids are surfaced as coverage
gaps, never dropped. `formatHotSubscribers` renders the human report.
