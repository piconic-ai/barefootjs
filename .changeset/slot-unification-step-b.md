---
"@barefootjs/client": minor
"@barefootjs/jsx": minor
---

Elide `<!--bf:sN-->…<!--/-->` markers for `/* @client */` text slots
outside loops/conditionals (slot unification Step B, spec/
slot-unification.md §3(b)) — the one 'text'-kind slot whose rendered
width is deterministically zero on every request, which is what makes a
real compile-time claim path sound without a marker to fall back on.
`client-only-elision.ts` decides this once, before either
`adapter.generate` or `generateClientJs` run, so all nine SSR adapters
and the CSR template emitter drop the same marker consistently.

Extends the claim-plan interpreter (`@barefootjs/client/runtime/
claim-slots.ts`) with a `markerless` `SlotSpec` flag: a markerless 'text'
slot's path resolves directly to its position (adopting an existing Text
node, or creating one at that exact index when SSR rendered nothing
there) instead of scanning for an anchor comment.

Adds claim-plan conformance (`packages/adapter-tests`): for every fixture
and every adapter, resolves the emitted claim plan's statically-known
paths against real SSR-rendered DOM and asserts each lands on the
expected anchor/position kind.

Ordinary reactive text slots (loop rows, conditional branches) are NOT
elided by this change — their rendered width is data-dependent per
request, which needs a different, not-yet-implemented safety argument
(see `client-only-elision.ts`'s module docstring and
spec/slot-unification.md §5a's "Step B measured" note).
