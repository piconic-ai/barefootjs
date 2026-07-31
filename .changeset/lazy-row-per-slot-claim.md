---
"@barefootjs/jsx": patch
---

Claim a lazy row's element refs per slot, on first use

An adopted (server-rendered) lazy row resolved its DOM refs through one
whole-row closure: `__e.refs ?? (__e.refs = __lzc_<loop>(__e))`, which ran a
`qsa` scan for EVERY reactive-attr slot in the row. So an `applyOuter` driving
one attribute still scanned for every other slot, on every row, at hydration —
a row with three attr slots ran three scans to write one attribute, 3,000 scans
across a 1,000-row list.

Each binding now claims its own slot on first use, the same deferral the
content door already had (`doorAccess`). `applyOuter` on that three-slot row
contains one `qsa`. The whole-row closure is gone, so there is one less
emission construct and one less per-loop allocation.

The cache test is `2 in __r`, not `??`. A slot whose scan finds nothing records
that and is not scanned again; a `??`-guarded cache would re-scan it on every
tick forever. `createRow` is untouched — it resolves refs from known clone
paths and never scanned.

**Measurement.** Counted, not timed, and the count is pinned in
`lazy-row-eligibility.test.ts`: three scans in `applyItem` (which does write
all three slots), one in `applyOuter`, zero in `createRow`. The existing SSR
heap bench does not move — 1573.1KB, unchanged — and cannot: its row has a
single reactive-attr slot, so its `applyOuter` already claimed exactly what it
wrote. The saving needs a row with several attr slots whose outer bindings
cover only some of them, which no current bench app has.
