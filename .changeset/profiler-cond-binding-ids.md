---
"@barefootjs/client": minor
"@barefootjs/jsx": minor
---

Attribute conditional-branch DOM-binding effects in the profiler (#1690, #1795 Phase 1).

A conditional's `insert()` effect and the attribute / text binding effects
emitted inside its branch `bindEvents` now carry a
`<Component>#binding:<slotId>` id in profile mode, and `buildIdIndex` resolves
them from the graph's `domBindings` (conditional / attribute / text slot + loc):

- **`insert()` runtime** — takes an optional trailing `bfId` and forwards it to
  the internal conditional re-eval `createEffect`, so a conditional's re-runs are
  attributed to its source line instead of showing as a bare runtime id.
- **branch attribute effects** — `createDisposableEffect(…, "<Comp>#binding:<slotId>")`
  for `class={…}` / reactive attrs written inside a branch swap.
- **branch text effects** — the `__bfText` re-splice effect carries the id too.

`profileComponentName` is threaded through `buildInsertPlan` → `InsertPlan` →
`stringifyInsert`, including recursively into nested conditionals. Previously
these branch-scoped re-runs surfaced in the hot-subscribers list as
unattributed runtime ids and inflated the coverage gap, even though a toggled
conditional is often the *most* re-run subscriber.

Off by default the emitted effects are byte-for-byte unchanged (SR8). Loop-child
text/attribute binding effects remain a follow-up (#1795 Phase 2).
