---
"@barefootjs/cli": minor
---

`bf debug profile <component> --scenario auto` now reaches compound / child-component handlers (#1690, closes #1796).

Auto mode previously compiled only the target's own file. For a compound
component whose interactive handler lives in a separately-registered child
(`<Collapsible><CollapsibleTrigger/>…`), the child was never compiled, so it
never registered, the mount couldn't wire it, and handler discovery read
`0 turns, 0/0 handlers` even though the composition has handlers.

Auto mode now walks the target's local (relative) import graph — the same
dependency-first resolution the `--scenario <story.tsx>` path already used —
so every child component registers via `hydrate(...)` before the root mounts,
its handlers enter the discovery set, and the toggle/click fires through the
composition. No story file required.
