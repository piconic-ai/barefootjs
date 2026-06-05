---
"@barefootjs/hono": patch
---

Render the fallback when an async boundary body fails. A `<Async>` / `BfAsync` body that throws synchronously or rejects during async resolution now surfaces the same `fallback` instead of aborting the stream (sync) or leaking an unhandled rejection (async). The body is wrapped in Hono's `ErrorBoundary` on both the runtime `BfAsync` component and the compiled `<Async>` emit path. `BfAsync` also gains an optional `onError` hook so failures aren't swallowed silently.
