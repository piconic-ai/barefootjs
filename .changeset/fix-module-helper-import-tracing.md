---
"@barefootjs/jsx": patch
---

Fix #2283: trace imports referenced only from module-level helper functions in the client-JS inliner.

The final import-usage scan ran before module-level constant/function bodies were substituted into the generated code, so an import used only inside a module-level helper (e.g. a pure helper extracted to module scope that calls a relative-import function) was invisible to the scan and silently dropped — producing a runtime `ReferenceError` in the browser even though `bf build`, `tsc`, and vitest all stayed green. Imports referenced from component-body closures were unaffected, since their code was already part of the scanned text.

Module-level declarations are now substituted first, so the usage scan sees the full generated code (including module-level helper bodies) before deciding which imports to keep.
