---
"@barefootjs/client": minor
"@barefootjs/jsx": patch
---

Attribute the loop reconcile effect in the profiler (#1690, #1795).

`mapArray` / `mapArrayAnchored` gain an optional `bfId` forwarded to their
internal reconcile `createEffect`, and the loop emitter passes
`<Component>#binding:<slotId>` for it in profile mode. `buildIdIndex` already
resolves that id from the graph's `loop` domBinding (slot + loc).

Dogfooding a list component showed the loop's reconcile effect is typically the
**single costliest subscriber** (it re-renders the list on every change) yet was
unattributed — it dominated the hot list as a bare `e1`. Now it reads
`s7 (loop)  3 runs, 4.8ms  (TodoApp.tsx:29)`. Off by default the `mapArray`
call is byte-for-byte unchanged (SR8). Per-item loop-child text effects remain
a follow-up under #1795.
