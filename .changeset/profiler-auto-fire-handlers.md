---
"@barefootjs/cli": patch
---

Auto-scenario fires every IR-known handler, not just buttons (#1690, #1796).

`bf debug profile --scenario auto` now drives interactions from the component
graph: for each `event` domBinding it dispatches the right event
(`MouseEvent`/`KeyboardEvent`/`Event`) on each `[bf="<slotId>"]` element —
including **delegated list-item handlers** and branch handlers — falling back to
the button/link sweep only when nothing resolves.

A list component whose only interaction is `<li onClick>` now reports
`coverage: N/N` and measures the row toggle, where before it read `0` turns.
