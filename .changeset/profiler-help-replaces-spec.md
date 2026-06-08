---
"@barefootjs/cli": patch
---

Profiler onboarding: a thorough `bf debug profile --help`, and remove the
standalone spec doc (#1690).

The design doc at `spec/profiler.md` had started to drift from the shipped
behavior, so it is removed and the CLI help becomes the single source of truth.
`bf debug profile --help` (and `-h`) now prints a self-contained guide: the
three modes (static budget / `--diff` regression / `--scenario` measured run),
how to read each section of a dynamic run (hot subscribers, wasted re-runs,
batch advisor, coverage), every flag with its default, examples, and the
build/dev-only notes. The top-level `bf --help` line now surfaces `--scenario`
and points at the dedicated help. In-code comments that referenced the removed
spec file were updated to stand on their own (pointing at issue #1690).
