---
"@barefootjs/client": minor
"@barefootjs/jsx": patch
---

Unify content-slot updates onto a single claim-based mechanism (slot
unification Step A, spec/slot-unification.md). The compiler now emits
claim plans for every content slot (loop-row text, preamble regions,
dynamic text/JSX slots, `@client` expressions) instead of the four
per-mechanism paths this replaces — `$t`-effect text slots, `__bfText`,
`patchSlotRange`, and `updateClientMarker` — all of which are deleted
along with the `bf-client:` marker grammar they depended on.

This cleanup step (A4) additionally removes the dead
`reconcileElements`/`reconcileList` runtime exports: no compiler emission
path has called them since element/list reconciliation moved to
`mapArray`/`mapArrayAnchored`, so they were unreachable dead code kept
alive only by their own unit tests. `getLoopChildren`/`getLoopNodes` (real
consumers remain in `mapArray`'s clearing path) move to a new
`runtime/loop-markers.ts` module with the same public export names — no
consumer-facing change.
