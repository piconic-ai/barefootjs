---
"@barefootjs/jsx": patch
---

Let a value-only `.map()` preamble use the lazy row graph

A loop row whose callback had a preamble was refused the lazy row graph on
sight, so it kept the eager emission — a root, a signal and an effect per row.
The rule was "any preamble at all", and it was over-broad by construction: what
actually matters is whether the preamble declares row-local REACTIVITY, not
whether it declares anything.

`analyzeLazyPreamble` replaces it with a structural proof that re-executing the
statements is observationally free. A preamble qualifies when it is a sequence
of `const` declarations whose initializers contain no `new`, assignment,
`++`/`--`, `await`, `yield`, `delete`, function/arrow/class expression — and no
call, with one exception: a **zero-argument signal or memo read**. That
exception is the point. `const cls = selected() === row.id ? 'danger' : ''` is
the shape the krausest bench writes, and it is sound in all three plan bodies
because of where they run: `mapArrayLazy` wraps `createRow` and `applyItem` in
`untrack()`, and `applyOuter` is the loop-level effect that is supposed to
subscribe. Everything else stays refused with a reason naming the exact node —
`createSignal` is a call, `arr.push(x)` is a call, and `Math.random()` is a call
whose value would differ between `createRow` and `applyItem`.

The preamble is emitted into `createRow` ONLY, and before the clone: the
per-row template literal interpolates the declared local, because an attribute
reading a preamble local is not classified as reactive and therefore never
becomes a wired binding. The apply bodies never reference one, which is why they
do not need it.

A binding that READS a declared local refuses the loop. That case is currently
unreachable from either direction — a child-position read becomes a
`preambleRegions` entry, which the gate already refuses, and an
attribute-position read lands in the template as above — so the refusal is not
dead weight but the fail-safe that keeps this sound if either of those facts
changes. Modelling it instead would have meant re-running the preamble in
`applyItem`/`applyOuter` and threading the preamble's own dependencies into
every binding that reads a local, for a shape nothing can currently produce.

Two `#1065` regression tests moved with the shape rather than being weakened:
their sources are now lazy-eligible, so the assertion that the preamble goes
through `wrapLoopParamAsAccessor` (`cell.flag` → `cell().flag`) is made against
`createRow`, where the preamble now lands. It is the same
`mapPreambleWrapped` computation either way.

No SSR output change, and no change for any loop that stays ineligible.
