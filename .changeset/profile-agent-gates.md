---
"@barefootjs/jsx": minor
"@barefootjs/cli": minor
---

Add agent-oriented gates and a machine-readable contract to `bf debug profile` (#1841).

A dynamic run (`--scenario`) now carries an agent contract in its JSON: a normalized top-level `status` (`ok`/`warning`/`error`), a flattened `findings` array (each with `severity`, an explicit `actionable` flag, and ready-to-run `nextCommands` like `bf debug trace <comp> <signal> --json`), a `coverage.ratio`, and — when handlers were under-exercised — `guidance` pointing at a story/scenario file. The structured per-analysis tables are unchanged; this is an additive agent view alongside them.

New opt-in CI gates make the command fail with intent: `--fail-on unresolved|hot|coverage` (with `--scenario`) and `--fail-on regression` (with `--diff`), plus the numeric thresholds `--min-coverage`, `--max-runs-per-turn`, and `--max-unresolved`. A tripped gate exits non-zero, escalates `status` to `error`, and emits a `gates` block (`{passed, failed, checks}`). By default no gate is active, so an ungated run is unchanged.
