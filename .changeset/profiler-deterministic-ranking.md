---
"@barefootjs/jsx": patch
---

Rank hot subscribers deterministically (#1690, SR7).

Dogfooding revealed the hot-subscribers list was ordered by `totalMs`
(wall-clock), so the same scenario produced different rankings run to run — a
component with many similarly-costed effects (e.g. `calendar`) reordered on
every run, violating SR7 ("same scenario ⇒ same ranked findings; timings vary,
ranks do not"). The structure (which subscribers, their run counts) was already
deterministic; only the timing-based sort wasn't.

The list now sorts by `runs` (a structural, timing-independent cost proxy) with
the subscriber id as a stable final tiebreak; `totalMs` is still shown but never
sorted on. `calendar`'s ranking is now identical across runs.
