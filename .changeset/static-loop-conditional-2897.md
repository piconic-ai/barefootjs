---
"@barefootjs/jsx": patch
---

Fix #2897: a reactive conditional (`{cond ? A : B}`) inside a static (non-signal) array's `.map()` row — either the row's own content or a depth-1 nested loop's row — never wired up reactively on the client. Neither the static `forEach` bake nor the `inner-loop-nested` clone-and-wire architecture (#2798) has any conditional-handling machinery, so the branch silently froze at its SSR-time value and never updated again. The client-side loop-routing decision now falls through to the plain/composite dynamic path (the same machinery a signal-backed array already uses correctly for this shape) whenever a conditional is present anywhere in the row tree; a row with only ref/reactive-text/reactive-attr bindings and no conditional keeps taking the static fast path unchanged.
