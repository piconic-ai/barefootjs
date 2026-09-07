---
"@barefootjs/jsx": patch
---

Fix eager reactive-attribute writes rewriting the DOM unconditionally on every `createEffect` rerun, regardless of which binding in that effect actually changed. This mattered most for a keyed `.map()` row's fused row effect, where a sibling binding's legitimate change reran the whole effect and rewrote every attribute in it — including one wrapped in `untrack()`, which only suppresses dependency registration, not re-execution of the surrounding effect. Every eager reactive-attribute write is now guarded against its previous value (`Object.is`), matching the guard the lazy row graph already had.
