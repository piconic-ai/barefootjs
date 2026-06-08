---
"@barefootjs/jsx": minor
"@barefootjs/cli": minor
---

feat: `bf debug profile` — static reactive profiler, v1 (#1690 SR5 + SR6)

Implements `bf debug profile` and companion library support.

**Command surface:**
- `bf debug profile <component>` — static reactive budget for a single component
- `bf debug profile --scenario auto` — ranked table for all reactive components in `ui/components/ui/`
- `bf debug profile --scenario <path.tsx>` — profile a specific file
- `bf debug profile <component> --diff` — compare current IR vs git HEAD (SR6 compile-diff)
- `--json` flag throughout

**Static analyses (SR5):**
- Max signal fan-out and hot-signal identification
- Max memo chain depth
- Total subscription count (Σ deps across memos, effects, DOM bindings)
- Batch candidates (handlers that set ≥2 distinct signals — `batch()` opportunities)
- Findings: `high-fan-out`, `deep-memo-chain`, `batch-candidate`, `fallback-heavy`

**SR6 (compile-diff):**
- `diffProfiles(before, after)` — surfaces regressions in fan-out, chain depth, fallbacks, subscriptions; improvements in the same metrics; neutral structural count changes.

**Bug fixes bundled in this PR:**

- **Bug A (debug.ts):** `buildComponentGraph` now falls back to the caller-supplied `filePath` when `findSourceFile` returns empty for non-reactive components. Previously `bf debug graph Button` showed `Button ()` (empty path); now correctly shows `Button (/path/to/button/index.tsx)`.

- **Bug C (debug-profile.ts):** Batch-candidate findings from handlers wired to multiple JSX locations (e.g. Calendar dual-month navigation) were reported once per JSX site. Deduplicated by `(kind, file, line, signals-set)` so each logically unique handler appears once.

- **Bug D (debug-profile.ts):** `batchCandidateCount` in metrics and the batch-candidate findings list used independent counting, causing the table column to disagree with the findings section. Both now use the same deduplicated set.

**Known limitation (Bug B — batch-candidate precision):** Static analysis resolves setter calls by regex without control flow awareness. Handlers that set one of two signals based on a condition (`if (isControlled()) { setA() } else { setB() }`) are reported as batch candidates even though only one setter fires per interaction. This is a known false positive documented in tests. A fix requires AST-level control flow analysis (v2 scope). The finding message now includes `(static; verify setters are not in separate if/else branches)` to help users self-triage.
