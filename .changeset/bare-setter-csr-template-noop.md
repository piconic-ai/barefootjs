---
"@barefootjs/jsx": patch
---

Follow-up to #2924: a component prop whose value was a bare — uncalled — reference to a local signal SETTER (`<Display update={setCount} />`, any non-`on*`-prefixed prop name) hit the identical CSR-fresh-mount `ReferenceError` as the getter case, because `csrSubstitute` had no substitution entry for a signal's setter name at all.

A bare setter reference now substitutes to the reference (Hono) adapter's own SSR noop shim (`() => {}`) — an `identifier`-kind entry, not `call`-kind: a setter is never itself invoked as a zero-arg accessor the way a getter is, so no thunk-wrapping is needed.
