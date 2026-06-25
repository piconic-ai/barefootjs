---
"@barefootjs/go-template": patch
---

Deduplicate the per-compile state priming shared by `generate()` and `generateTypes()` into a single `primeCompileState(ir)` method (Go adapter readability). Internal-only, output byte-identical (verified by the adapter unit + conformance suites); no behavioural or public-API change.

The two entry points each set the same ~10 `CompileState` fields from the IR (props-object / rest names, module-const + local-const tables, memos, type definitions, context consumers, `searchParams` locals) and call `augmentInheritedPropAccesses` — `generateTypes` carried a row of "Mirror `generate()`" comments warning about exactly the drift this removes.
