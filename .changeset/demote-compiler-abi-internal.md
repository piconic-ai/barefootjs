---
"@barefootjs/client": patch
---

`createDisposableEffect` and the profiler plumbing (`beginTurn`, `endTurn`, `createRecordingSink`, `setProfilerSink`, `ProfilerEvent`, `ProfilerEventSink`, `ProfilerEventType`, `RecordingSink`, `SubscriberKind`) are now tagged `@internal` and no longer appear in `docs/core/advanced/api-reference.md`. They are compiler-emitted / tooling-only ABI with zero authored call sites in `ui/`, `site/` or `integrations/`. Documentation tier only; no runtime change.
