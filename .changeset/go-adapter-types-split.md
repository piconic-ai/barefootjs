---
"@barefootjs/go-template": patch
---

Split the inline sections out of the Go adapter's `generateTypes` into focused private emitters, leaving it as clean orchestration (readability). Internal-only, output byte-identical (verified by the adapter unit + conformance suites); no behavioural or public-API change.

- `buildLocalTypeTables` — populate `localTypeNames` / `localTypeAliases` / `localStructFields` from the IR's type definitions.
- `emitLocalTypeStructs` — emit Go structs / string aliases for local type definitions.
- `emitSynthStructs` — synthesise + emit a struct per untyped object-array signal (#1680).
- `resolveNestedLoopItemTypes` — resolve a null loop `itemType` from a memo-derived / direct module-const array (#1897).
- `composeFileHeader` — assemble the package clause + sorted import block once `usesFmt` / `usesHtmlTemplate` / `needsStringsImport` are known.

`generateTypes` drops from ~330 to ~50 lines — priming, the five `emit*`/`build*` steps, the three struct generators, and the header compose.
