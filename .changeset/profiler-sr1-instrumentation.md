---
"@barefootjs/client": minor
---

Add dev-only reactive instrumentation hooks for `bf debug profile` (#1690, SR1).

The runtime gains a single, gated measurement sink installed via
`setProfilerSink(sink | null)`. When a sink is set, the reactive choke points in
`reactive.ts` emit events — `signalSet`, `subscribeAdd`/`subscribeRemove`,
`effectCreate`/`effectEnter`/`effectExit`/`effectDispose`, and
`batchBegin`/`batchFlush` — carrying node ids, timing, and batch state. A memo's
effect-run and its private signal-set share one id so the profiler can collapse
them into a single node.

The sink is null by default (production), so every choke point stays a single
null-check branch with no allocation and no behavior change — reactive
semantics are unaffected (SR8). The `ProfilerEventSink` / `SubscriberKind` types
and `setProfilerSink` are exported from `@barefootjs/client`.
