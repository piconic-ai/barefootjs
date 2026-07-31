---
"@barefootjs/jsx": patch
---

Let a wiring-free row conditional use the lazy row graph

A loop row containing a reactive conditional was refused the lazy row graph
outright, because the eager emission drives it with `insert()` — one
`createEffect` per row, plus a runtime probe of both branch templates to decide
element-vs-fragment form, a resolved search region, and per-branch `bindEvents`
cleanup. Calling that from a lazy row would reinstate exactly the per-row
reactive resource the design removes.

`analyzeLazyConditional` accepts the case where BOTH arms are static elements
that own nothing — no events, no child components, no inner loop, no nested
conditional, no reactive attr or text. For that shape everything `insert()` does
collapses to one operation: replace the `[bf-c]` element when the condition
flips. All the rest of `insert` exists for arms that own something.

No runtime addition was needed. Both arms are compile-time constants, so each is
parsed once per LOOP into a hoisted `<template>` and cloned on a flip; what
remains per row is a boolean, a dedup slot and a `replaceWith`. Element-vs-
fragment is decided by reading `addCondAttrToTemplate`'s output — the same door
the eager path uses — rather than re-deciding it here. `createRow` writes no DOM:
the row it just cloned already rendered the correct arm, so it records only the
dedup boolean. `applyOuter` seeds by comparing the browser's serialization of the
arm it would install against the live element's, so a server-rendered arm that
already agrees costs no write.

Still refused, each with its own reason: an arm owning wiring, an arm that
interpolates the item, a fragment conditional (`{cond ? 'a' : 'b'}` and
`{cond && …}` both), and a condition reading the loop index.

**Not measured, and currently unexercised by the corpus.** No committed fixture
or snapshot moved — every conditional in the corpus owns wiring — and the
benchmark row has no conditional. Coverage is a dedicated conformance fixture
(clean on all nine adapters and CSR) plus DOM tests on both row shapes,
including an adopted server-rendered row whose outer-driven condition seeds
against SSR. The claim is "this shape is now lazy and correct", not "a benchmark
moved".
