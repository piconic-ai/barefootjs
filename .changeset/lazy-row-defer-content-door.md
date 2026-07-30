---
"@barefootjs/jsx": patch
---

Build a lazy loop row's content door on first use instead of at claim time,
so an `applyOuter` that only drives attributes stops allocating one closure
per row of the list.

A lazy-eligible loop's adopted-row claim (`__lzc_<mid>`) resolved the element
refs *and* constructed the content door — `lazySlots(__el, __lzs_<mid>)` — in
one tuple. That tuple is built for every entry the first time either apply
path touches the row, and `applyOuter`'s seed pass touches **all** of them.
So a loop whose only outer-involving binding is an attribute (the common
`className={selected() === row.id ? … : …}` shape) built a door per row at
hydration and used none of them: nothing writes content until that row's item
actually changes.

The claim now leaves the door's slot `null` and `applyItem`/`applyOuter`
materialize it on demand, once per apply body and only when that body has
content bindings to write:

```js
const __d = __r[1] ?? (__r[1] = lazySlots(__e.primaryEl, __lzs_l0))
```

`createRow` is deliberately unchanged: it writes every text on the tick it
clones the row, so its door is used immediately and deferring it would only
add a branch. The deferral is therefore confined to server-rendered rows,
which is where the allocation was wasted.

With the door gone from the claim, the element refs are the only parts left
that read the row root — so a row with no reactive ATTRIBUTE now claims to a
bare `[null]` and no longer binds `__e.primaryEl` at all.

**§2's claim-once rule is preserved.** That rule is about one door resolving
the whole plan on first access, and each door already enforces it internally —
`lazySlots`/`lazyClaimSlots` call `claimRefs` once and cache the result.
Deferring *construction* moves when that single resolution happens; it does not
add a second resolution path. A loop with an outer-involving TEXT still claims
every row at seed, because read-compare-write cannot compare what it has not
resolved, so the deferral is a no-op there by design.

Measured on the SSR post-hydration heap bench
(`benchmarks/ssr/bench-ssr-memory.ts` — 1,000 rows, item texts plus an
outer-signal class): **1630.6KB → 1573.2KB / 1572.9KB** over two after-runs,
**-57.4KB (-3.5%)**, against a per-run stdev of 0.1-0.6KB with the react and
solid columns unmoved as controls. Two things about that number are worth
recording, because the follow-up entry in `spec/slot-unification.md` §8 had
both wrong. The estimate there (~230KB/1k rows) was too high: it predated the
per-row claim-plan hoist, and `lazySlots` never scanned eagerly to begin with,
so what remained was a closure per row rather than a resolved slot map. And the
DOM suite's memory column — where the previous hoist was measured — cannot
show this at all, since it creates its rows client-side through `createRow`,
the path left eager here.

Behavioural coverage is
`packages/client/__tests__/runtime/lazy-row-adopted-door.test.ts`: real Hono
SSR markup, hydrated, then an item changed. That sequence is the only one that
executes the deferred branch — emission tests read the generated text, the
`createComponent` tests take the eager path, and the conformance suites never
run a post-hydration update — and it was verified to fail when the door is
built against the wrong root.
