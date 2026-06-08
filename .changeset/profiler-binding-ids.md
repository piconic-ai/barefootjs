---
"@barefootjs/jsx": minor
---

Attribute DOM-binding effects in the profiler (#1690, closes #1795).

Top-level reactive bindings — text (`{total()}`), attribute (`class={…}`,
`data-state`), client-only markers, and component/child prop syncs — now emit
`createEffect(…, "<Component>#binding:<slotId>")` in profile mode, and
`buildIdIndex` resolves those ids from the graph's `domBindings` (slot + loc).

Previously these showed in the hot-subscribers list as bare, unresolved runtime
ids (`e1`, `e2`) and inflated the coverage gap — yet they are often the *most*
re-run subscribers. Now every binding re-run is attributed to a source line, so
`bf debug profile <component> --scenario auto` reports zero coverage gaps for a
typical component (e.g. `switch`: both attribute syncs map to `index.tsx:146`
and `:151`). Off by default the emitted effects are byte-for-byte unchanged
(SR8). Loop/branch-scoped binding effects remain a follow-up under #1795.
