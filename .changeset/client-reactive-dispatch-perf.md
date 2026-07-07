---
"@barefootjs/client": patch
---

Performance: signal→effect dispatch is significantly faster. Effect dependency tracking now uses generation-stamped diffing, so an effect whose read set is unchanged between runs no longer unsubscribes/resubscribes on every run, and unbatched `set()` reuses a cached subscriber snapshot instead of allocating a new array per write (invalidated only when membership actually changes). Observable semantics are unchanged — synchronous dispatch order, snapshot-at-dispatch behavior for mid-dispatch subscribe/unsubscribe, dynamic dependency drop, `Object.is` bail, `batch()`, `untrack`, cleanup timing, and the circular-run guard are all preserved and pinned by new tests; the profiler-instrumented path emits a byte-identical event stream.
