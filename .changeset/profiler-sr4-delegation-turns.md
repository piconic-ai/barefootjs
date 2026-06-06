---
"@barefootjs/jsx": minor
---

Extend profile-mode turn markers (#1690, SR3) to the loop event-delegation path.

A dynamic list delegates child events to one container listener. In profile
mode each delegated handler call is now bracketed with `beginTurn`/`endTurn`
(id `<Component>#handler:<childSlotId>:<eventName>`), so the reactive work a
list-row interaction triggers is attributed to one turn — the same id namespace
as direct handlers. The marker is a single-statement `beginTurn(id); try { … }
finally { endTurn() }` wrap, dropped into every item-lookup shape.

Threaded via `EventDelegationPlan.profileComponentName`, set by the top-level
and static-array delegation builders (which have `ctx`). Off by default the
dispatcher is byte-for-byte unchanged (SR8). Branch-scoped delegation (a loop
nested inside a conditional branch) does not yet carry markers — tracked as a
follow-up.
