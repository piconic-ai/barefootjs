---
"@barefootjs/jsx": patch
---

Emit lazy row plans for eligible plain loops (slot unification §9, L3)

A plain loop row whose shape passes the §9.4 eligibility gate now compiles to
`mapArrayLazy(...)` with a compiler-built row plan instead of `mapArray(...)`
plus a renderItem: no `createRoot`, no per-item signal, no per-row effect, and
no hydration-time query/claim/DOM write per row. Item-driven bindings are
applied by the reconciler through `applyItem` (refs claimed lazily on a row's
first update, per-binding dedup on `entry.last`); outer-involving bindings are
applied by ONE loop-level effect (`applyOuter`) with read-compare-write seeding
on its first run, so there is no trust-first-run regression.

Eligibility is an explicit, unit-tested decision function
(`lazyRowEligibility`): keyed single-root conditional-free plain rows, no refs
/ nested components / inner loops / map-callback preamble, every reactive outer
dependency a primable signal or memo getter, a loop source provably derived
from props and literals, and never in profile mode. Every other loop keeps
today's eager emission byte-for-byte — sound-or-loud, no silent third path.

SSR templates are unchanged; this is a client-JS-only change.
