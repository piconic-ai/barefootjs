---
"@barefootjs/jsx": patch
---

Exclude event handlers from static fan-out and subscription counts (#1690, SR5).

Cross-checking the static budget against a dynamic run revealed the static
fan-out over-counted: a signal read inside an event handler (e.g.
`setCount(count() + 1)`) listed that handler as a "subscriber", but a handler
runs outside any reactive scope and does **not** re-run when the signal changes.
For a `count` read by one handler the static fan-out reported 8 while the run
showed 7 actual subscribers. Fan-out and `subscriptions` now exclude event
handlers, so the static prediction matches the measured reactive fan-out.
