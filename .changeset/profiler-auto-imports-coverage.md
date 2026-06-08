---
"@barefootjs/cli": patch
"@barefootjs/jsx": patch
---

`bf debug profile --scenario auto` now attributes imported child components and quiets runtime-bookkeeping coverage noise (#1840).

Two related attribution/coverage fixes:

- **Imported child sources reach the id index.** Auto mode loaded a target's
  local imports to drive the run, but did not pass them into
  `buildProfileReport`, so events from composed children (e.g. `DatePicker`
  importing `Calendar`) resolved to `((unresolved))`. Auto mode now forwards
  those imported sources the same way the `--scenario <story.tsx>` path does,
  so `Calendar#binding:*` subscribers map back to their source location.

- **Anonymous runtime ids no longer masquerade as coverage gaps.** The reactive
  runtime assigns fallback `s<n>`/`e<n>`/`m<n>`/`r<n>` ids to nodes with no
  compiler `__bfId`. These can never map to a source node, so reporting them as
  `coverage.unattributed` made healthy reports look broken. `joinProfilerEvents`
  now routes them to a separate non-actionable `diagnostics` bucket (surfaced,
  never dropped), leaving `unattributed` for actionable gaps only.
