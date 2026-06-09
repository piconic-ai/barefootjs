---
"@barefootjs/jsx": patch
---

fix(profile): summarize `coverage.diagnostics` in JSON (#1849 B7)

The JSON `coverage.diagnostics` field is now a compact `{ count, sample }` summary instead of a per-id array that could run to hundreds of non-actionable entries for loop-heavy components. The text report is unchanged (it only ever printed the count).

Note: `ProfileReport.coverage.diagnostics` is now an object rather than an array.
