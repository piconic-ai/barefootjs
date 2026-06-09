---
"@barefootjs/jsx": minor
---

feat(profile): split fan-out into direct vs via-memo, flag `⚠ high` on direct

The static reactivity budget reported a single per-signal fan-out — the
*transitive* subscriber count — and flagged `⚠ high` off it. That conflated two
very different things: subscribers a write re-runs directly, and subscribers
sitting behind a memo barrier (which only re-run when the memo's value actually
changes). It also made memo-barrier refactors look like regressions: routing N
reads through a new memo *lowers* real re-run pressure but *raises* the
transitive total (more nodes become statically attributable), so the number
went up after an optimization.

`FanOutEntry` now carries `direct` alongside `subscribers` (the transitive
total). The text output shows the split — `currentYear → 11 subscribers
(6 direct · 5 via memo)` — and `⚠ high` keys off **direct** fan-out, the real
per-write pressure. `bf debug profile --diff` likewise tracks direct fan-out, so
a memo-barrier refactor reads as the improvement it is rather than a false
regression.
