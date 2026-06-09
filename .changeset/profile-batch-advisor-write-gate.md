---
"@barefootjs/jsx": minor
---

fix(profile): stop the dynamic batch advisor flagging single-write turns

`bf debug profile <component> --scenario` measures a run and advises wrapping
*multi-write* handlers in `batch()`. It inferred "multi-write" from repeated
effect runs (`savings = totalRuns − distinctSubscribers`), which over-counted
two ways:

- a single `set()` that fans out to a loop re-runs one binding id once per item
  (e.g. a 42-cell calendar grid → one id, hundreds of runs), and
- a memo recompute writes its own private signal (a memo is an effect that
  writes a signal sharing its id), so each cascade step looked like another
  write.

Together these produced confident false positives like Calendar's day-click
reported as `batch candidate 558→9 (saves 549)` and Slider's pointer drag as
`5→4` — turns that each make exactly one handler write, where `batch()` saves
nothing.

The advisor now counts only `signalSet`s made directly in the handler body
(effect-nesting depth 0, tracked via `effectEnter`/`effectExit`) and requires a
turn to make ≥ 2 such writes before it is a candidate. Genuine multi-write turns
still surface. `BatchCandidate` gains a `writes` field, and `savings` is
documented as an upper bound (a loop's per-item runs share one id and are not
collapsed by a batch).
