---
"@barefootjs/jsx": patch
---

Accept outer-involving TEXT bindings in lazy rows (slot unification §9.5c(1))

The §9.4 eligibility gate refused any lazy-row loop with a text binding that
read component-scope state: `lazySlots`' writer is write-only, so §9.3(1)'s
read-compare-write seeding had no DOM read-back for a content slot. The
runtime now ships `lazyClaimSlots`, the read-capable twin over the SAME claim,
so that refusal is gone — a loop whose row renders e.g. `{row.label}` next to
a cell derived from an outer signal is now lazy instead of falling back to the
eager per-row root + signal + effect emission.

The door is chosen ONCE PER LOOP, never per binding: a loop with at least one
outer-involving text claims through `lazyClaimSlots(...)` and every text write
becomes `__r[w].write('sN', v)`; every other loop keeps the single-closure
`lazySlots(...)` writer and the bare `__r[w]('sN', v)` call form, byte for
byte. That matters because the door is allocated per ROW — a reader on every
row of a 1k-row list is measurable, so only loops that need reads pay for one.

The seed guard mirrors the attribute one:
`__seed ? (__r[w].read('sN') !== String(__x)) : (<entry.last dedup>)`. `read`
returns `null` when it cannot answer and `null !== String(__x)` is always
true, so the comparison already fails safe into "write it".

Honest cost: reading a content slot claims that row's plan, so a loop with an
outer-involving text pays one claim per row at hydration rather than the
row-pristine zero — inherent to read-compare-write for content, and still far
cheaper than the eager path it replaces. Attribute-only loops are unaffected.
