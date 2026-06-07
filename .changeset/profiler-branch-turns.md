---
"@barefootjs/jsx": patch
---

Extend profile-mode turn markers to conditional-branch handlers (#1690, #1786).

`profileComponentName` is now threaded through `buildInsertPlan` so the two
remaining handler paths get `beginTurn`/`endTurn` like the top-level and
top-level-loop paths:

- **branch-arm direct listeners** — `emitListenerLine` takes an optional turn id
  and wraps via `wrapHandlerForTurn`; arm events carry it (`ArmEventBind.turnId`).
- **branch-scoped loop delegation** — `buildBranchLoopDelegationPlan` now sets
  `EventDelegationPlan.profileComponentName`, so a loop nested inside a
  conditional wraps its delegated handlers too.

Off by default the emitted code carries no markers (SR8). With three handler
sites — top-level, branch-arm, branch-loop — a profile build now emits exactly
three `beginTurn`s. The loop-cond arm path (`BranchEventBindingsPlan`) remains a
minor follow-up under #1786.
