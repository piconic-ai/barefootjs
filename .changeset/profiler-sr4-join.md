---
"@barefootjs/shared": minor
"@barefootjs/client": minor
"@barefootjs/jsx": minor
---

Add the SR2 event collector and SR4 IR join for `bf debug profile` (#1690).

- **`@barefootjs/shared`**: `ProfilerEvent` / `ProfilerEventType` — the
  normalized event wire contract shared by the runtime producer and the jsx
  consumer. It lives in `shared` (built first, depended on by both) so the
  jsx↔client peer relationship stays free of a build-order cycle.
- **`@barefootjs/client`**: `createRecordingSink()` (SR2) — turns the raw
  `ProfilerEventSink` callbacks (SR1) into a flat, ordered, **turn-stamped**
  event log. It tracks the `beginTurn`/`endTurn` stack (SR3) and stamps every
  event with the handler id in scope, so per-turn metrics need no microtask
  guesswork.
- **`@barefootjs/jsx`**: `buildIdIndex(graph)` + `joinProfilerEvents(events,
  index)` (SR4) — resolve each event's compiler-assigned id to its source-mapped
  IR node (signals/memos/effects, including controlled-signal sync effects).
  Unresolved ids are surfaced as coverage gaps, never dropped (SR4 invariant).

These are the substrate the v1 analyses (hot subscribers / wasted re-runs /
batch advisor) consume next. Dev-only; no effect on production builds (SR8).
